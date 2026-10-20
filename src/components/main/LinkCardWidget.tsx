'use client';
// 링크 카드 위젯 (사용자 요청) — AI 채팅 캐릭터 이미지 하나 | 옆에 플랫폼별 링크.
// 링크는 약자(예: CD, RF)를 적은 작은 알약으로, 늘어나면 이미지 옆에서 줄을 바꿔 계속 이어진다.
// 낮/밤 테마 색은 CSS가 맡는다. 여러 개 추가할 수 있다 (캐릭터마다 하나씩).
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { hrefOf } from '@/lib/infoStore';

export interface CardLink { label: string; url: string }

const linksOf = (conf: WidgetConf): CardLink[] => {
  const v = conf.settings.links;
  return Array.isArray(v) ? (v as CardLink[]).map(l => ({ label: String(l?.label ?? ''), url: String(l?.url ?? '') })) : [];
};
const imgOf = (conf: WidgetConf) => (typeof conf.settings.img === 'string' ? conf.settings.img : null);
const nameOf = (conf: WidgetConf) => (typeof conf.settings.name === 'string' ? conf.settings.name : '');

/** 사진 주소 — 사이트에 든 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string | null) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img ?? undefined);
  return fixed ?? blob;
}

export function LinkCardWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === conf.id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [conf.id]);
  const src = usePic(imgOf(conf));
  const name = nameOf(conf).trim();
  const links = linksOf(conf).filter(l => l.label.trim() && hrefOf(l.url));
  return (
    <div className="panel widget lc-widget">
      <div className="lc-pic">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={name} draggable={false} /> : <span>{isAdmin ? '＋ 이미지' : ''}</span>}
      </div>
      <div className="lc-side">
        {name && <div className="lc-name">{name}</div>}
        <div className="lc-links">
          {links.length
            ? links.map((l, i) => (
              <a key={i} className="lc-chip" href={hrefOf(l.url)} target="_blank" rel="noopener noreferrer">
                {l.label.trim()}<i aria-hidden>↗</i>
              </a>
            ))
            : isAdmin && <span className="lc-empty">⚙ 눌러 링크 추가</span>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="링크 카드"
        desc="캐릭터 이미지 하나와 플랫폼별 링크 — 약자는 짧게(예: CD, RF, TP)"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <LinkCardEditor conf={conf} />}
      </Modal>
    </div>
  );
}

export function LinkCardEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const links = linksOf(conf);
  const setLinks = (n: CardLink[]) => set({ links: n });
  const src = usePic(imgOf(conf));
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= links.length) return;
    const n = [...links];
    [n[i], n[j]] = [n[j], n[i]];
    setLinks(n);
  };
  return (
    <div className="lc-edit">
      <div className="lc-edit-top">
        <button type="button" className="lc-epic" onClick={() => { if (!busy) fileRef.current?.click(); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" /> : <span>{busy ? '올리는 중…' : '＋ 이미지'}</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" data-crop="1:1" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true);
            try { set({ img: await putBlob(f) }); } catch (err) { toast(`이미지를 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
            setBusy(false);
          }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="k-input" value={nameOf(conf)} placeholder="캐릭터 이름 (선택)" onChange={e => set({ name: e.target.value })} />
          {imgOf(conf) && <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 10.5 }} onClick={() => set({ img: null })}>이미지 빼기</button>}
        </div>
      </div>
      <div className="lc-erows">
        {links.map((l, i) => (
          <div key={i} className="lc-erow">
            <input className="k-input lc-elabel" value={l.label} placeholder="약자" maxLength={12}
              onChange={e => { const n = [...links]; n[i] = { ...l, label: e.target.value }; setLinks(n); }} />
            <input className="k-input lc-eurl" value={l.url} placeholder="https://… 캐릭터 링크"
              onChange={e => { const n = [...links]; n[i] = { ...l, url: e.target.value }; setLinks(n); }} />
            <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
            <button type="button" aria-label="아래로" disabled={i === links.length - 1} onClick={() => move(i, 1)}>▼</button>
            <button type="button" aria-label="빼기" onClick={() => setLinks(links.filter((_, j) => j !== i))}>−</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', padding: '5px 14px', fontSize: 11.5 }}
          onClick={() => setLinks([...links, { label: '', url: '' }])}>＋ 링크 추가</button>
      </div>
    </div>
  );
}
