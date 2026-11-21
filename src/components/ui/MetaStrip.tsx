'use client';
// 메타데이터 지우기 (사용자 요청 — 마이페이지) — 사진 여러 장을 넣으면 찍은 위치(GPS)·기기·날짜·생성 정보 같은
// 숨은 정보를 모두 지워서 돌려준다. 전부 이 브라우저 안에서만 처리하고 어디에도 올리지 않는다.
//  · JPEG·PNG·WebP·GIF: 그림은 그대로 두고(재압축 없음) 정보 덩어리만 잘라 낸다 (lib/imageMeta)
//  · 그 밖의 형식(HEIC·AVIF·BMP 등): 브라우저가 읽을 수 있으면 다시 그려 PNG로 — 정보는 함께 사라진다
// 사진 자르기 창이 끼어들지 않게 input에 data-nocrop을 붙이고, 끌어다 놓기도 직접 받는다.
import React, { useEffect, useRef, useState } from 'react';
import { stripImageMetaInfo } from '@/lib/imageMeta';
import { useToast } from '@/components/ui/Toast';

interface Item {
  id: number; name: string; before: number; after: number;
  status: 'work' | 'removed' | 'clean' | 'redrawn' | 'fail';
  file?: File; url?: string;
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);
const NATIVE = /^image\/(jpeg|jpg|png|webp|gif)$/i;

/** 직접 못 자르는 형식 — 다시 그려 PNG로 (그림만 남는다) */
async function redraw(f: File): Promise<File | null> {
  const url = URL.createObjectURL(f);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d')!.drawImage(im, 0, 0);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
    if (!blob) return null;
    return new File([blob], f.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png', lastModified: 0 });
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

let seq = 0;

export function MetaStrip() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  const add = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif|avif|bmp|jpe?g|png|webp|gif)$/i.test(f.name));
    if (!files.length) { toast('사진 파일을 넣어 주세요'); return; }
    const start = files.map(f => ({ id: ++seq, name: f.name, before: f.size, after: 0, status: 'work' as const }));
    setItems(v => [...start, ...v]);
    for (let k = 0; k < files.length; k++) {
      const f = files[k], id = start[k].id;
      let out: File | null = null, status: Item['status'] = 'fail';
      if (NATIVE.test(f.type)) {
        const r = await stripImageMetaInfo(f);
        out = r.blob instanceof File ? r.blob : new File([r.blob], f.name, { type: f.type, lastModified: 0 });
        status = r.removed ? 'removed' : 'clean';
      } else {
        out = await redraw(f);
        status = out ? 'redrawn' : 'fail';
      }
      let url: string | undefined;
      if (out) { url = URL.createObjectURL(out); urls.current.push(url); }
      setItems(v => v.map(it => (it.id === id ? { ...it, status, file: out ?? undefined, url, after: out?.size ?? 0, name: out?.name ?? it.name } : it)));
    }
  };

  const done = items.filter(i => i.file);
  const saveOne = (it: Item) => {
    if (!it.url) return;
    const a = document.createElement('a'); a.href = it.url; a.download = it.name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const saveAll = async () => {
    const files = done.map(i => i.file!);
    if (!files.length) return;
    // 휴대폰은 공유 창으로 (사진 앱에 저장), 컴퓨터는 한 장이면 그대로 · 여러 장이면 zip 하나로
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files })) {
      try { await navigator.share({ files }); } catch { /* 취소 */ }
      return;
    }
    if (files.length === 1) { saveOne(done[0]); return; }
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const used = new Set<string>();
      for (const f of files) {
        let n = f.name, k = 1;
        while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`);
        used.add(n);
        zip.file(n, f);
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); // 한글 zip 이름은 일부 브라우저에서 'download'로 바뀌어 받아져 영문으로
      const d = new Date(); const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      a.download = `photos-clean-${ymd}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      toast(`묶지 못했어요 — 한 장씩 받아 주세요 (${e instanceof Error ? e.message : String(e)})`);
    }
    setZipping(false);
  };

  const label = (it: Item) => ({
    work: '지우는 중…',
    removed: `정보 지움 · ${kb(it.before)} → ${kb(it.after)}`,
    clean: '숨은 정보가 없던 사진이에요',
    redrawn: `다시 그려 정보 없앰 (PNG) · ${kb(it.after)}`,
    fail: '이 브라우저에서 읽을 수 없는 형식이에요',
  }[it.status]);

  return (
    <div className="panel" style={{ padding: 24 }}>
      <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 10 }}>메타데이터 지우기</h4>
      <p className="hint" style={{ margin: '0 0 12px' }}>사진 속 숨은 정보(찍은 위치·기기·날짜, 생성 이미지의 프롬프트 등)를 지워서 돌려드려요 · 사진은 어디에도 올라가지 않아요</p>
      <div className={`ms-drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
        onClick={() => inp.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); void add(e.dataTransfer.files); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4" /><path d="M15 9h.01" />
        </svg>
        <b>사진을 끌어다 놓거나 눌러서 고르기</b>
        <small>여러 장 한꺼번에 · JPG · PNG · WebP · GIF (그 밖의 형식은 PNG로 바꿔 드려요)</small>
      </div>
      <input ref={inp} type="file" accept="image/*" multiple hidden data-nocrop=""
        onChange={e => { void add(e.target.files); e.target.value = ''; }} />

      {items.length > 0 && (
        <>
          <ul className="ms-list">
            {items.map(it => (
              <li key={it.id} data-s={it.status}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.url ? <img src={it.url} alt="" /> : <span className="ms-ph" />}
                <div className="ms-info">
                  <b>{it.name}</b>
                  <small>{label(it)}</small>
                </div>
                {it.url && <button type="button" className="btn btn-ghost" onClick={() => saveOne(it)}>받기</button>}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = []; setItems([]); }}>비우기</button>
            <button type="button" className="btn btn-dark" disabled={!done.length || zipping} onClick={() => { void saveAll(); }}>
              {zipping ? '묶는 중…' : done.length > 1 ? `${done.length}장 모두 받기` : '받기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
