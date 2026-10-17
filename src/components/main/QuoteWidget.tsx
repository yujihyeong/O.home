'use client';
// 오늘의 대사 위젯 (사용자 요청) — 관리자가 입력해 둔 문장 중 하나를 랜덤으로 보여 준다.
// 「↻ 다른 대사」로 다시 뽑기. 대사마다 말한 캐릭터를 고른다 (캐릭터 = 이름 + 얼굴 사진, 위젯 설정에서 관리).
// 캐릭터 페이지 이동은 없음 (사용자 요청).
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

/** 대사 — charId로 캐릭터를 가리킨다. who/img는 캐릭터 고르기 이전에 쓴 대사의 이름·사진 (그대로 보여 준다) */
export interface QuoteLine { id: string; text: string; charId?: string; who?: string; img?: string }
export interface QuoteChar { id: string; name: string; img?: string }

/** 기본 캐릭터 (사용자 제공 그림 — 얼굴 중심 정사각형 크롭, public/quote-chars) */
const DEFAULT_CHARS: QuoteChar[] = [
  { id: 'jsw', name: '지선우', img: '/quote-chars/1.webp' },
  { id: 'dove', name: '도브', img: '/quote-chars/2.webp' },
];
const charsOf = (conf: WidgetConf) => (conf.settings.chars as QuoteChar[] | undefined) ?? DEFAULT_CHARS;

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/** 사진 주소 — 사이트에 들어 있는 기본 그림(/quote-chars/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img);
  return fixed ?? blob;
}

function Face({ img, cls = 'qt-av' }: { img?: string; cls?: string }) {
  const src = usePic(img);
  if (!img) return null;
  return (
    <span className={cls}>
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
  const chars = charsOf(conf);
  const lines = ((conf.settings.lines as QuoteLine[]) ?? []).filter(l => l.text.trim());
  // 뽑기는 화면에 뜬 뒤에 — 서버 렌더와 어긋나지 않게
  const [pick, setPick] = useState<string | null>(null);
  const [fade, setFade] = useState(false);
  const cur = lines.find(l => l.id === pick) ?? null;
  const ch = cur?.charId ? chars.find(c => c.id === cur.charId) : undefined;
  const who = ch ? ch.name : cur?.who;
  const img = ch ? ch.img : cur?.img;
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
          <Face img={img} />
          <div className="qt-txt">
            <div className="qt-bub">{cur.text}</div>
            {who && <div className="qt-who">— {who}</div>}
          </div>
        </div>
      ) : (
        <p className="hint">{isAdmin ? '「설정 ›」에서 대사를 입력해 주세요' : '아직 대사가 없습니다'}</p>
      )}
      {lines.length > 1 && <button type="button" className="qt-re" onClick={again}>↻ 다른 대사</button>}
      <Modal open={open} onClose={() => setOpen(false)} title="오늘의 대사"
        desc="입력해 둔 대사 중 하나가 랜덤으로 떠요 — 대사마다 말한 캐릭터를 골라 주세요"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <QuoteEditor conf={conf} />}
      </Modal>
    </div>
  );
}

/** 캐릭터 한 줄 — 얼굴 사진(누르면 바꾸기) · 이름 · 삭제 */
function CharRow({ c, patch, del }: { c: QuoteChar; patch: (p: Partial<QuoteChar>) => void; del: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = usePic(c.img);
  const [busy, setBusy] = useState(false);
  return (
    <div className="qt-char-row">
      <button type="button" className="qt-pic" title={c.img ? '사진 바꾸기' : '사진 넣기'}
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
      <KInput value={c.name} placeholder="캐릭터 이름" style={{ flex: 1 }} onChange={e => patch({ name: e.target.value })} />
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }} onClick={del}>DELETE</button>
    </div>
  );
}

export function QuoteEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const chars = charsOf(conf);
  const lines = (conf.settings.lines as QuoteLine[]) ?? [];
  const set = (p: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const setLines = (next: QuoteLine[]) => set({ lines: next });
  const setChars = (next: QuoteChar[]) => set({ chars: next });
  const options = [
    { value: '', label: '캐릭터 없음' },
    ...chars.map(c => ({
      value: c.id,
      label: <span className="qt-opt"><Face img={c.img} cls="qt-opt-av" />{c.name || '(이름 없음)'}</span>,
    })),
  ];

  return (
    <div>
      <span className="cp-lb">캐릭터</span>
      <div className="qt-chars">
        {chars.map(c => (
          <CharRow key={c.id} c={c}
            patch={p => setChars(chars.map(x => (x.id === c.id ? { ...x, ...p } : x)))}
            del={() => setChars(chars.filter(x => x.id !== c.id))} />
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => setChars([...chars, { id: uid('c'), name: '' }])}>＋ 캐릭터 추가</button>
      </div>

      <span className="cp-lb" style={{ display: 'block', marginTop: 16 }}>대사</span>
      {lines.length === 0 && <p className="hint" style={{ margin: '6px 0' }}>아직 대사가 없어요 — 아래 버튼으로 추가해 주세요</p>}
      <DragList items={lines} keyOf={l => l.id} onReorder={setLines}
        render={l => {
          const patch = (p: Partial<QuoteLine>) => setLines(lines.map(x => (x.id === l.id ? { ...x, ...p } : x)));
          return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
              <span className="drag-h" style={{ paddingTop: 7 }}>⠿</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <KTextarea value={l.text} rows={1} style={{ minHeight: 34 }} placeholder="대사"
                  onChange={e => patch({ text: e.target.value })} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <KSelect minWidth={150} value={l.charId && chars.some(c => c.id === l.charId) ? l.charId : ''}
                    onChange={v => patch({ charId: v || undefined, who: undefined, img: undefined })}
                    options={options} />
                  {!l.charId && l.who && <span className="hint">예전 이름: {l.who}</span>}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }}
                onClick={() => setLines(lines.filter(x => x.id !== l.id))}>DELETE</button>
            </div>
          );
        }} />
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
        onClick={() => setLines([...lines, { id: uid('q'), text: '', charId: lines[lines.length - 1]?.charId ?? chars[0]?.id }])}>＋ 대사 추가</button>
    </div>
  );
}
