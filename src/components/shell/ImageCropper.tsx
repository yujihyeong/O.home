'use client';
// 사진 자르기 (사용자 요청) — 사진을 올리는 곳 어디서든, 고른 사진을 원하는 부분만 잘라서 올린다.
//
// 업로드 버튼이 사이트 곳곳(20곳 넘게)에 흩어져 있어서 하나하나 고치는 대신, 사진 파일을 고르는 순간
// (input[type=file]의 change)을 화면 맨 앞에서 가로채 자르기 창을 띄우고, 잘린 사진으로 바꿔 끼운 뒤
// 원래 업로드 코드에 그대로 넘긴다. 그래서 새로 생기는 업로드 버튼도 자동으로 자르기가 붙는다.
// 끌어다 놓기(fileDrop)도 같은 창을 거친다.
//
//  · 들어갈 자리의 모양을 아는 곳은 input에 data-crop="1:1" 처럼 적어 두면 그 비율로 먼저 열린다
//    (프로필 사진 = 1:1 등). 모르면 사진 원래 비율로 열고, 비율 버튼으로 바꿀 수 있다.
//  · 「자르지 않고 그대로」로 원본을 올릴 수도 있다. 움짤(GIF)·SVG는 자르면 망가지므로 건너뛴다.
//  · data-nocrop이 붙은 input(마우스 커서 등)은 건드리지 않는다.
import { stripImageMetaInfo, markHadMeta } from '@/lib/imageMeta';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Ratio = number | 'orig';
interface Job { id: number; files: File[]; hint?: string; resolve: (out: File[] | null) => void }

const CROPPABLE = /^image\/(jpeg|jpg|png|webp|bmp|heic|heif|avif)$/i;
const canCrop = (f: File) => CROPPABLE.test(f.type);

/** "1:1" · "3/4" · "1.5" → 숫자 비율 */
function parseRatio(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^\s*([\d.]+)\s*[:/]\s*([\d.]+)\s*$/);
  const n = m ? Number(m[1]) / Number(m[2]) : Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/* ---------- 바깥에서 부르는 창구 ---------- */
let open: ((job: Job) => void) | null = null;
let jobSeq = 0;
const waiting: Job[] = [];

/** 고른 파일들을 자르기 창에 차례로 보낸다. 사진이 아니면 그대로. 취소하면 null */
export function cropFiles(files: File[], hint?: string): Promise<File[] | null> {
  if (!files.some(canCrop)) return Promise.resolve(files);
  return new Promise(resolve => {
    const job = { id: ++jobSeq, files, hint, resolve };
    if (open) open(job); else waiting.push(job);
  });
}

const PRESETS: { label: string; r: Ratio }[] = [
  { label: '원본 비율', r: 'orig' }, { label: '1:1', r: 1 }, { label: '4:3', r: 4 / 3 },
  { label: '3:4', r: 3 / 4 }, { label: '16:9', r: 16 / 9 }, { label: '9:16', r: 9 / 16 },
];
const MAX_SIDE = 4000;   // 너무 큰 사진은 이 크기로 줄인다

/** 자른 영역을 같은 형식(PNG는 PNG, 나머지는 JPEG/WebP)으로 다시 그린다 */
async function render(img: HTMLImageElement, file: File, sx: number, sy: number, sw: number, sh: number): Promise<File> {
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const type = /png/i.test(file.type) ? 'image/png' : /webp/i.test(file.type) ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, type, 0.93));
  if (!blob) return file;
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
  return new File([blob], name, { type, lastModified: Date.now() });
}

export function ImageCropHost() {
  const [job, setJob] = useState<Job | null>(null);
  const queue = useRef<Job[]>([]);

  // 창구 열기 + 화면 전체의 사진 고르기 가로채기
  useEffect(() => {
    open = j => { queue.current.push(j); setJob(cur => cur ?? queue.current.shift() ?? null); };
    while (waiting.length) open(waiting.shift()!);

    const passing = new WeakSet<HTMLInputElement>();
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement | null;
      if (!el || el.tagName !== 'INPUT' || el.type !== 'file' || passing.has(el)) return;
      if (el.hasAttribute('data-nocrop')) return;
      const files = Array.from(el.files ?? []);
      if (!files.some(canCrop)) return;
      // 원래 업로드 코드가 이 신호를 받기 전에 멈추고, 자른 뒤 다시 보낸다
      e.stopImmediatePropagation();
      void cropFiles(files, el.dataset.crop).then(async out => {
        if (!out) { el.value = ''; return; }             // 취소 — 올리지 않는다
        // 다시 그린 사진은 메타데이터가 없다 — 원본에 있었으면 표시해 「지웠어요」 알림이 뜨게 (사용자 요청)
        await Promise.all(out.map(async (f, i) => {
          const src = files[i];
          if (src && f !== src && (await stripImageMetaInfo(src)).removed) markHadMeta(f);
        }));
        try {
          const dt = new DataTransfer();
          out.forEach(f => dt.items.add(f));
          el.files = dt.files;
        } catch { /* 바꿔 끼우기를 못 하는 브라우저 — 원본 그대로 넘긴다 */ }
        passing.add(el);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        passing.delete(el);
      });
    };
    window.addEventListener('change', onChange, true);
    return () => { window.removeEventListener('change', onChange, true); open = null; };
  }, []);

  const done = useCallback((out: File[] | null) => {
    job?.resolve(out);
    setJob(queue.current.shift() ?? null);
  }, [job]);

  if (!job || typeof document === 'undefined') return null;
  return createPortal(<CropFlow key={job.id} job={job} onDone={done} />, document.body);
}

/** 파일 여러 장이면 한 장씩 차례로 */
function CropFlow({ job, onDone }: { job: Job; onDone: (out: File[] | null) => void }) {
  const [idx, setIdx] = useState(0);
  const out = useRef<File[]>([]);
  const list = job.files;
  // 자를 수 없는 파일(움짤 등)은 그대로 담고 건너뛴다
  useEffect(() => {
    if (idx < list.length && !canCrop(list[idx])) { out.current.push(list[idx]); setIdx(i => i + 1); }
    if (idx >= list.length) onDone(out.current);
  }, [idx, list, onDone]);
  if (idx >= list.length || !canCrop(list[idx])) return null;
  const croppable = list.filter(canCrop).length;
  const nth = list.slice(0, idx + 1).filter(canCrop).length;
  const next = (f: File) => { out.current.push(f); setIdx(i => i + 1); };
  return (
    <CropOne key={idx} file={list[idx]} hint={job.hint} counter={croppable > 1 ? `${nth} / ${croppable}` : ''}
      onApply={next}
      onKeep={() => next(list[idx])}
      onKeepAll={croppable > 1 && nth < croppable ? () => { out.current.push(...list.slice(idx)); setIdx(list.length); } : undefined}
      onCancel={() => onDone(null)} />
  );
}

function CropOne({ file, hint, counter, onApply, onKeep, onKeepAll, onCancel }: {
  file: File; hint?: string; counter: string;
  onApply: (f: File) => void; onKeep: () => void; onKeepAll?: () => void; onCancel: () => void;
}) {
  const hintR = parseRatio(hint);
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<Ratio>(hintR ?? 'orig');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });   // 사진 중심이 틀 중심에서 벗어난 정도(틀 픽셀)
  const [busy, setBusy] = useState(false);

  // 틀 크기 — 화면에 맞춰
  const [box, setBox] = useState({ w: 340, h: 340 });
  const r = ratio === 'orig' ? (nat ? nat.w / nat.h : 1) : ratio;
  useEffect(() => {
    const fit = () => {
      const maxW = Math.min(460, window.innerWidth - 64), maxH = Math.min(420, window.innerHeight - 300);
      const w = Math.min(maxW, maxH * r);
      setBox({ w, h: w / r });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [r]);

  // 사진이 틀을 늘 덮도록 — 기본 배율(cover) × 확대
  const base = nat ? Math.max(box.w / nat.w, box.h / nat.h) : 1;
  const s = base * zoom;
  const iw = nat ? nat.w * s : 0, ih = nat ? nat.h * s : 0;
  const clamp = useCallback((p: { x: number; y: number }) => ({
    x: Math.max(-(iw - box.w) / 2, Math.min((iw - box.w) / 2, p.x)),
    y: Math.max(-(ih - box.h) / 2, Math.min((ih - box.h) / 2, p.y)),
  }), [iw, ih, box.w, box.h]);
  useEffect(() => { setPos(p => clamp(p)); }, [clamp]);
  useEffect(() => { setZoom(1); setPos({ x: 0, y: 0 }); }, [ratio]);

  // 끌어서 옮기기 (손가락 두 개면 확대)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      setZoom(Math.max(1, Math.min(5, pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d)));
    } else if (drag.current) {
      setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => setZoom(z => Math.max(1, Math.min(5, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))));

  const apply = async () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true);
    // 틀 왼쪽 위가 원본 사진의 어디인지
    const sx = (iw / 2 - box.w / 2 - pos.x) / s, sy = (ih / 2 - box.h / 2 - pos.y) / s;
    try { onApply(await render(img, file, sx, sy, box.w / s, box.h / s)); } catch { onKeep(); }
  };

  const presets = hintR && !PRESETS.some(p => typeof p.r === 'number' && Math.abs(p.r - hintR) < 0.01)
    ? [{ label: '이 자리 비율', r: hintR as Ratio }, ...PRESETS] : PRESETS;

  return (
    <div className="ic-ov" role="dialog" aria-label="사진 자르기">
      <div className="ic-box">
        <div className="ic-head">
          <b>사진 자르기</b>{counter && <span className="ic-cnt">{counter}</span>}
          <button type="button" className="ic-x" aria-label="취소" onClick={onCancel}>✕</button>
        </div>
        <p className="ic-hint">사진을 끌어서 옮기고, 아래 막대(또는 휠·두 손가락)로 확대해 원하는 부분을 틀 안에 맞춰 주세요</p>
        {failed ? (
          <p className="ic-hint" style={{ padding: '40px 0' }}>이 사진은 여기서 열 수 없어요 — 「자르지 않고 그대로」로 올려 주세요</p>
        ) : (
          <div className="ic-stage">
            <div className="ic-frame" style={{ width: box.w, height: box.h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={url} alt="" draggable={false}
                onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onError={() => setFailed(true)}
                style={nat ? { width: iw, height: ih, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` } : { opacity: 0 }} />
              <i className="ic-grid" />
            </div>
          </div>
        )}
        <div className="ic-zoom">
          <span>－</span>
          <input type="range" min={1} max={5} step={0.01} value={zoom} disabled={failed}
            onChange={e => setZoom(Number(e.target.value))} aria-label="확대" />
          <span>＋</span>
        </div>
        <div className="ic-ratios">
          {presets.map(p => (
            <button key={p.label} type="button" className={`ic-chip ${(p.r === ratio || (typeof p.r === 'number' && typeof ratio === 'number' && Math.abs(p.r - ratio) < 0.001)) ? 'on' : ''}`}
              onClick={() => setRatio(p.r)}>{p.label}</button>
          ))}
        </div>
        <div className="ic-acts">
          {onKeepAll && <button type="button" className="btn btn-ghost" onClick={onKeepAll}>남은 사진 모두 그대로</button>}
          <button type="button" className="btn btn-ghost" onClick={onKeep}>자르지 않고 그대로</button>
          <button type="button" className="btn btn-dark" disabled={busy || failed || !nat} onClick={() => void apply()}>{busy ? '자르는 중…' : '자르기'}</button>
        </div>
      </div>
    </div>
  );
}
