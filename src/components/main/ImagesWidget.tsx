'use client';
// 이미지 위젯 (사용자 요청) — 이미지만 1·2·3장 나란히. 글씨·제목 없음.
// 위젯 크기를 바꾸면 이미지 칸도 같이 늘어나고 줄어든다(칸을 꽉 채우도록 잘라 보여 줌).
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

const countOf = (conf: WidgetConf) => { const n = Number(conf.settings.count ?? 2); return n === 1 || n === 3 ? n : 2; };
const imgsOf = (conf: WidgetConf) => (conf.settings.imgs as (string | null)[] | undefined) ?? [];
const gapOf = (conf: WidgetConf) => { const n = Number(conf.settings.gap ?? 8); return Number.isFinite(n) ? Math.max(0, Math.min(40, n)) : 8; };
const radiusOf = (conf: WidgetConf) => { const n = Number(conf.settings.radius ?? 10); return Number.isFinite(n) ? Math.max(0, Math.min(40, n)) : 10; };

/** 사진 주소 — 사이트에 든 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string | null) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img ?? undefined);
  return fixed ?? blob;
}

function Slot({ img, empty }: { img?: string | null; empty?: React.ReactNode }) {
  const src = usePic(img);
  return (
    <div className="iw-slot">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" draggable={false} /> : empty}
    </div>
  );
}

export function ImagesWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === conf.id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [conf.id]);
  const n = countOf(conf);
  const imgs = imgsOf(conf);
  return (
    <div className={`panel widget iw-widget ${isAdmin && !editOn ? 'iw-admin' : ''}`}
      style={{ '--iw-gap': `${gapOf(conf)}px`, '--iw-r': `${radiusOf(conf)}px` } as React.CSSProperties}
      /* 관리자는 위젯을 누르기만 해도 설정 창이 열린다 (사용자 요청 — ⚙가 잘 안 보여 찾기 어려웠다).
         편집모드에서는 끌어 옮겨야 하므로 열지 않는다 */
      onClick={() => { if (isAdmin && !editOn) setOpen(true); }}
      data-tip={isAdmin && !editOn ? '눌러서 설정' : undefined}>
      <div className="iw-row">
        {Array.from({ length: n }, (_, i) => (
          <Slot key={i} img={imgs[i]} empty={<span className="iw-empty">{isAdmin ? '＋ 이미지' : ''}</span>} />
        ))}
      </div>
      {/* 창 안의 클릭이 위젯 클릭으로 번져 닫자마자 다시 열리지 않게 */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'contents' }}>
        <Modal open={open} onClose={() => setOpen(false)} title="이미지 위젯"
          desc="칸 수를 고르고 칸을 눌러 이미지를 넣어 주세요 — 위젯 크기를 바꾸면 이미지 길이도 같이 바뀌어요"
          actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
          {open && <ImagesEditor conf={conf} />}
        </Modal>
      </div>
    </div>
  );
}

/** 편집 창의 칸 하나 — 누르면 이미지 고르기(자르기 창이 지금 칸 비율로 열린다) */
function EditSlot({ img, ratio, onSet }: { img?: string | null; ratio: string; onSet: (ref: string | null) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = usePic(img);
  const [busy, setBusy] = useState(false);
  return (
    <div className="iw-eslot">
      <button type="button" className="iw-epic" onClick={() => { if (!busy) fileRef.current?.click(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span>{busy ? '올리는 중…' : '＋ 이미지'}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" data-crop={ratio} style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { onSet(await putBlob(f)); } catch (err) { toast(`이미지를 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          setBusy(false);
        }} />
      {img && <button type="button" className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }} onClick={() => onSet(null)}>빼기</button>}
    </div>
  );
}

export function ImagesEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const n = countOf(conf);
  const imgs = imgsOf(conf);
  const gap = gapOf(conf), radius = radiusOf(conf);
  // 지금 위젯 크기에서 한 칸의 비율 — 자르기 창이 이 비율로 열린다
  const pad = 20;
  const ratio = conf.w && conf.h
    ? `${Math.max(1, Math.round((conf.w - pad - gap * (n - 1)) / n))}:${Math.max(1, Math.round(conf.h - pad))}`
    : '3:4';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="cp-lb">칸 수</span>
        <div className="mini-seg">
          {[1, 2, 3].map(k => (
            <button key={k} type="button" className={n === k ? 'on' : ''} onClick={() => set({ count: k })}>{k}개</button>
          ))}
        </div>
      </div>
      <div className="iw-edit" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n }, (_, i) => (
          <EditSlot key={i} img={imgs[i]} ratio={ratio}
            onSet={ref => { const next = [...imgs]; while (next.length < 3) next.push(null); next[i] = ref; set({ imgs: next }); }} />
        ))}
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="cp-lb" style={{ minWidth: 64 }}>사이 간격</span>
        <input type="range" min={0} max={40} value={gap} style={{ flex: 1 }} onChange={e => set({ gap: Number(e.target.value) })} />
        <span className="hint" style={{ minWidth: 34 }}>{gap}px</span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="cp-lb" style={{ minWidth: 64 }}>모서리</span>
        <input type="range" min={0} max={40} value={radius} style={{ flex: 1 }} onChange={e => set({ radius: Number(e.target.value) })} />
        <span className="hint" style={{ minWidth: 34 }}>{radius}px</span>
      </label>
    </div>
  );
}
