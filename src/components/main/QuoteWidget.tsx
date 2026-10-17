'use client';
// 오늘의 대사 위젯 (사용자 요청) — 관리자가 입력해 둔 문장 중 하나를 랜덤으로 보여 준다.
// 「↻ 다른 대사」로 다시 뽑기. 문장마다 말한 사람 이름·사진(선택)을 붙일 수 있다 — 캐릭터 페이지 이동은 없음.
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

export interface QuoteLine { id: string; text: string; who?: string; img?: string }

const uid = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

function Face({ img }: { img?: string }) {
  const src = useBlobUrl(img);
  if (!img) return null;
  return (
    <span className="qt-av">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </span>
  );
}

export function QuoteWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));
  const lines = ((conf.settings.lines as QuoteLine[]) ?? []).filter(l => l.text.trim());
  // 뽑기는 화면에 뜬 뒤에 — 서버 렌더와 어긋나지 않게
  const [pick, setPick] = useState<string | null>(null);
  const [fade, setFade] = useState(false);
  const cur = lines.find(l => l.id === pick) ?? null;
  const draw = (avoid?: string) => {
    const pool = lines.length > 1 ? lines.filter(l => l.id !== avoid) : lines;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
  };
  useEffect(() => {
    if (!cur && lines.length) setPick(draw());
  });
  const again = () => {
    if (editOn || lines.length < 2) return;
    setFade(true);
    setTimeout(() => { setPick(draw(pick ?? undefined)); setFade(false); }, 180);
  };

  return (
    <div className="panel widget qt-widget">
      <h4>TODAY&apos;S LINE {isAdmin && <span className="more" onClick={e => { e.stopPropagation(); if (!editOn) setOpen(true); }}>설정 ›</span>}</h4>
      {cur ? (
        <div className={`qt-body ${fade ? 'fade' : ''}`}>
          <Face img={cur.img} />
          <div className="qt-txt">
            <div className="qt-bub">{cur.text}</div>
            {cur.who && <div className="qt-who">— {cur.who}</div>}
          </div>
        </div>
      ) : (
        <p className="hint">{isAdmin ? '「설정 ›」에서 대사를 입력해 주세요' : '아직 대사가 없습니다'}</p>
      )}
      {lines.length > 1 && <button type="button" className="qt-re" onClick={again}>↻ 다른 대사</button>}
      <Modal open={open} onClose={() => setOpen(false)} title="오늘의 대사"
        desc="입력해 둔 문장 중 하나가 랜덤으로 떠요 — ⠿ 드래그로 순서 조정"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <QuoteEditor conf={conf} />}
      </Modal>
    </div>
  );
}

function LineRow({ l, patch, del }: { l: QuoteLine; patch: (p: Partial<QuoteLine>) => void; del: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = useBlobUrl(l.img);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      <span className="drag-h" style={{ paddingTop: 7 }}>⠿</span>
      <button type="button" className="qt-pic" title={l.img ? '사진 바꾸기' : '사진 넣기 (선택)'}
        onClick={() => { if (!busy) fileRef.current?.click(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span>{busy ? '…' : '＋'}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { patch({ img: await putBlob(f) }); } catch (err) { toast(`사진을 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          setBusy(false);
        }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <KTextarea value={l.text} rows={1} style={{ minHeight: 34 }} placeholder="대사"
          onChange={e => patch({ text: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}>
          <KInput value={l.who ?? ''} placeholder="말한 사람 (선택)" style={{ flex: 1 }} onChange={e => patch({ who: e.target.value })} />
          {l.img && <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }} onClick={() => patch({ img: undefined })}>사진 빼기</button>}
        </div>
      </div>
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }} onClick={del}>DELETE</button>
    </div>
  );
}

export function QuoteEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const lines = (conf.settings.lines as QuoteLine[]) ?? [];
  const setLines = (next: QuoteLine[]) =>
    updateWidget(conf.id, { settings: { ...conf.settings, lines: next } }, { persist: true });
  return (
    <div>
      {lines.length === 0 && <p className="hint" style={{ marginBottom: 8 }}>아직 대사가 없어요 — 아래 버튼으로 추가해 주세요</p>}
      <DragList items={lines} keyOf={l => l.id} onReorder={setLines}
        render={l => (
          <LineRow l={l}
            patch={p => setLines(lines.map(x => (x.id === l.id ? { ...x, ...p } : x)))}
            del={() => setLines(lines.filter(x => x.id !== l.id))} />
        )} />
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
        onClick={() => setLines([...lines, { id: uid(), text: '' }])}>＋ 대사 추가</button>
      <p className="hint" style={{ marginTop: 8 }}>왼쪽 동그라미를 누르면 말한 사람 사진을 넣을 수 있어요 (없으면 사진 없이 말풍선만)</p>
    </div>
  );
}
