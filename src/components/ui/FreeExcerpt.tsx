'use client';
// 직접 쓰는 발췌기 (사용자 요청 — 관리자 마이페이지 전용).
// 글에서 고르는 대신 문장·제목·저자를 직접 적고, 기존 발췌 카드(꾸미기·페이지 나누기·이미지 저장)로 만든다.
// 적던 내용은 이 브라우저에 남겨 둔다 — 다시 와도 이어서.
import React, { useEffect, useState } from 'react';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ExcerptCard } from '@/components/ui/ExcerptCard';

const KEY = 'ohome.freeExcerpt.v1';
interface Draft { text: string; title: string; author: string }

/** 빈 줄로 문단을 나눈다 — 빈 줄이 하나도 없으면 줄마다 한 문단 */
function toParas(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return [];
  const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n+/) : t.split('\n');
  return parts.map(p => p.trim()).filter(Boolean);
}

export function FreeExcerpt() {
  const toast = useToast();
  const [d, setD] = useState<Draft>({ text: '', title: '', author: '' });
  const [view, setView] = useState(false);
  const [snap, setSnap] = useState<{ paras: string[]; title: string; source: string } | null>(null);

  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Draft | null; if (v) setD(v); } catch { /* 무시 */ }
  }, []);
  const set = (p: Partial<Draft>) => setD(o => {
    const n = { ...o, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* 무시 */ }
    return n;
  });

  const open = () => {
    const paras = toParas(d.text);
    if (!paras.length) { toast('발췌할 문장을 적어 주세요'); return; }
    const title = d.title.trim(), author = d.author.trim();
    // 출처 줄 — 있는 것만: — 「제목」 · 저자
    const source = title || author ? `— ${[title && `「${title}」`, author].filter(Boolean).join(' · ')}` : '';
    setSnap({ paras, title, source });
    setView(true);
  };

  return (
    <div className="panel" style={{ padding: 24 }}>
      <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>EXCERPT</h4>
      <div style={{ display: 'grid', gap: 9 }}>
        <KTextarea value={d.text} onChange={e => set({ text: e.target.value })} style={{ minHeight: 150 }}
          placeholder={'발췌할 문장을 적거나 붙여 넣어 주세요\n빈 줄로 문단을 나눠요'} aria-label="발췌할 문장" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KInput value={d.title} onChange={e => set({ title: e.target.value })} placeholder="제목" aria-label="제목"
            style={{ flex: 2, minWidth: 160 }} />
          <KInput value={d.author} onChange={e => set({ author: e.target.value })} placeholder="저자" aria-label="저자"
            style={{ flex: 1, minWidth: 120 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {(d.text || d.title || d.author) && (
            <button className="btn btn-ghost" onClick={() => set({ text: '', title: '', author: '' })}>비우기</button>
          )}
          <button className="btn btn-dark" onClick={open}>발췌하기</button>
        </div>
      </div>

      <Modal open={view} onClose={() => setView(false)} title="발췌"
        desc="배경·글씨를 꾸며 이미지로 저장할 수 있어요">
        {view && snap && (
          <ExcerptCard paras={snap.paras} source={snap.source} title={snap.title}
            fileName={`${snap.title || '발췌'}${snap.title ? ' 발췌' : ''}`} />
        )}
        <div className="form-actions" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => setView(false)}>CLOSE</button>
        </div>
      </Modal>
    </div>
  );
}
