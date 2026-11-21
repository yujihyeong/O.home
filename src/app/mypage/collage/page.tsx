'use client';
// 사진 콜라주 (사용자 요청 — 마이페이지) — 좋아하는 사진 여러 장을 한 장으로 붙인다. 프레임 꾸미기는 없이 담백하게.
//  · 배치(칸 나누기)와 판 비율 · 사이 간격 · 모서리 · 바탕색만 고른다
//  · 칸을 누르면 그 칸이 골라지고, 끌면 사진 위치를, 확대 막대(또는 휠)로 크기를 맞춘다
//  · 빈 칸을 누르면 사진을 고른다 · 칸에 못 들어간 사진은 아래 대기 줄에 — 칸을 고른 뒤 누르면 바꿔 넣는다
//  · 미리보기와 저장본을 같은 그리기 함수로 그린다 (보이는 그대로 저장). 저장은 긴 변 3000px
// 사진은 이 브라우저 안에서만 쓰고 어디에도 올리지 않는다 (사진 자르기 창이 끼어들지 않게 data-nocrop)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

type Rect = [number, number, number, number];   // x, y, w, h (0~1)
interface Layout { id: string; cells: Rect[] }
const L = (id: string, cells: Rect[]): Layout => ({ id, cells });
const LAYOUTS: Layout[] = [
  L('1', [[0, 0, 1, 1]]),
  L('2h', [[0, 0, .5, 1], [.5, 0, .5, 1]]),
  L('2v', [[0, 0, 1, .5], [0, .5, 1, .5]]),
  L('3c', [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]),
  L('3l', [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]]),
  L('3t', [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]]),
  L('4g', [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]]),
  L('4t', [[0, 0, 1, 2 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]]),
  L('4l', [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]]),
  L('5', [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, 1 / 3, .5], [1 / 3, .5, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]]),
  L('6a', [[0, 0, 1 / 3, .5], [1 / 3, 0, 1 / 3, .5], [2 / 3, 0, 1 / 3, .5], [0, .5, 1 / 3, .5], [1 / 3, .5, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]]),
  L('6b', [[0, 0, .5, 1 / 3], [.5, 0, .5, 1 / 3], [0, 1 / 3, .5, 1 / 3], [.5, 1 / 3, .5, 1 / 3], [0, 2 / 3, .5, 1 / 3], [.5, 2 / 3, .5, 1 / 3]]),
  L('9', Array.from({ length: 9 }, (_, i) => [(i % 3) / 3, Math.floor(i / 3) / 3, 1 / 3, 1 / 3] as Rect)),
];
const RATIOS: [string, number][] = [['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['4:3', 4 / 3], ['16:9', 16 / 9]];
const BGS = ['#ffffff', '#f4efe6', '#1d1f23', '#000000'];

interface Photo { id: number; url: string; img: HTMLImageElement; name: string }
interface Fit { fx: number; fy: number; zoom: number }     // 초점(0~1) · 확대(1~4)
const FIT0: Fit = { fx: .5, fy: .5, zoom: 1 };

/** 칸 사각형(px) — 바깥 여백과 칸 사이 간격이 같다 */
function cellBox(c: Rect, W: number, H: number, gap: number) {
  const x0 = gap + c[0] * (W - gap), y0 = gap + c[1] * (H - gap);
  const x1 = gap + (c[0] + c[2]) * (W - gap) - gap, y1 = gap + (c[1] + c[3]) * (H - gap) - gap;
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** 칸을 덮는 크기·위치 (cover + 확대 + 초점) */
function place(img: HTMLImageElement, b: { w: number; h: number }, f: Fit) {
  const k = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight) * f.zoom;
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  return { dw, dh, dx: (b.w - dw) * f.fx, dy: (b.h - dh) * f.fy };
}

function drawCollage(ctx: CanvasRenderingContext2D, W: number, H: number, o: {
  layout: Layout; slots: (Photo | null)[]; fits: Fit[]; gapPct: number; radPct: number; bg: string; sel?: number; preview?: boolean;
}) {
  const s = Math.min(W, H);
  const gap = (o.gapPct / 100) * s, rad = (o.radPct / 100) * s;
  ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H);
  o.layout.cells.forEach((c, i) => {
    const b = cellBox(c, W, H, gap);
    const r = Math.min(rad, b.w / 2, b.h / 2);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, r); ctx.clip();
    const p = o.slots[i];
    if (p) {
      const pl = place(p.img, b, o.fits[i] ?? FIT0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(p.img, b.x + pl.dx, b.y + pl.dy, pl.dw, pl.dh);
    } else if (o.preview) {
      const dark = o.bg === '#000000' || o.bg === '#1d1f23';
      ctx.fillStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.3)';
      const z = Math.max(10, Math.min(b.w, b.h) * 0.16);
      ctx.fillRect(b.x + b.w / 2 - z / 2, b.y + b.h / 2 - z * 0.06, z, z * 0.12);
      ctx.fillRect(b.x + b.w / 2 - z * 0.06, b.y + b.h / 2 - z / 2, z * 0.12, z);
    }
    ctx.restore();
    if (o.preview && o.sel === i) {
      ctx.save(); ctx.strokeStyle = '#d97f97'; ctx.lineWidth = 3; ctx.setLineDash([]);
      ctx.beginPath(); ctx.roundRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, Math.max(0, r - 1.5)); ctx.stroke(); ctx.restore();
    }
  });
}

/** 배치 고르기 버튼 속 작은 그림 */
function LayoutIcon({ l }: { l: Layout }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden>
      {l.cells.map((c, i) => <rect key={i} x={1 + c[0] * 28 + .8} y={1 + c[1] * 28 + .8} width={c[2] * 28 - 1.6} height={c[3] * 28 - 1.6} rx="1.5" />)}
    </svg>
  );
}

let seq = 0;

export default function CollagePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [layout, setLayout] = useState<Layout>(LAYOUTS[6]);
  const [ratio, setRatio] = useState(1);
  const [gapPct, setGapPct] = useState(1.2);
  const [radPct, setRadPct] = useState(0);
  const [bg, setBg] = useState('#ffffff');
  const [photos, setPhotos] = useState<Photo[]>([]);      // 넣은 순서 = 칸 순서, 칸보다 많으면 대기 줄
  const [fits, setFits] = useState<Record<number, Fit>>({});   // 사진 id → 위치·확대
  const [sel, setSel] = useState(-1);
  const [busy, setBusy] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement>(null);
  const target = useRef<number>(-1);     // 빈 칸을 눌러 고를 때 그 칸
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  const n = layout.cells.length;
  const slots: (Photo | null)[] = Array.from({ length: n }, (_, i) => photos[i] ?? null);
  const fitOf = (i: number) => (slots[i] ? fits[slots[i]!.id] ?? FIT0 : FIT0);

  // 미리보기 — 칸 폭에 맞춰 화면 배율로
  const [size, setSize] = useState({ w: 600, h: 600 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const maxW = el.clientWidth, maxH = Math.min(window.innerHeight * 0.7, 760);
      let w = maxW, h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  const paint = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCollage(ctx, size.w, size.h, { layout, slots, fits: slots.map((_, i) => fitOf(i)), gapPct, radPct, bg, sel, preview: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, layout, photos, fits, gapPct, radPct, bg, sel]);
  useEffect(paint, [paint]);

  const load = (f: File) => new Promise<Photo | null>(res => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { urls.current.push(url); res({ id: ++seq, url, img, name: f.name }); };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const got = (await Promise.all(files.map(load))).filter(Boolean) as Photo[];
    if (got.length < files.length) toast(`${files.length - got.length}장은 이 브라우저에서 열 수 없는 사진이에요`);
    // 사진은 앞에서부터 빈틈없이 칸을 채우므로, 빈 칸을 눌러 고른 사진도 다음 빈 칸부터 들어간다
    setPhotos(ps => [...ps, ...got]);
    target.current = -1;
    // 사진 수에 맞는 배치로 바꿔 준다 (처음 넣을 때만)
    if (!photos.length && got.length && got.length !== n) {
      const m = LAYOUTS.find(l => l.cells.length === Math.min(9, got.length)) ?? LAYOUTS.find(l => l.cells.length >= got.length);
      if (m) setLayout(m);
    }
  };

  // 끌어서 위치 맞추기 · 휠로 확대
  const drag = useRef<{ i: number; x: number; y: number; f: Fit; moved: boolean } | null>(null);
  const cellAt = (e: React.PointerEvent | React.WheelEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const gap = (gapPct / 100) * Math.min(size.w, size.h);
    return layout.cells.findIndex(c => { const b = cellBox(c, size.w, size.h, gap); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; });
  };
  const setFit = (i: number, f: Fit) => { const p = slots[i]; if (p) setFits(m => ({ ...m, [p.id]: f })); };
  const onDown = (e: React.PointerEvent) => {
    const i = cellAt(e);
    if (i < 0) { setSel(-1); return; }
    setSel(i);
    if (!slots[i]) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { i, x: e.clientX, y: e.clientY, f: fitOf(i), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = slots[d.i]; if (!p) return;
    const gap = (gapPct / 100) * Math.min(size.w, size.h);
    const b = cellBox(layout.cells[d.i], size.w, size.h, gap);
    const pl = place(p.img, b, d.f);
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const room = (v: number) => (Math.abs(v) < 0.5 ? Infinity : v);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    setFit(d.i, { ...d.f, fx: clamp(d.f.fx + dx / room(b.w - pl.dw)), fy: clamp(d.f.fy + dy / room(b.h - pl.dh)) });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (d) return;
    const i = cellAt(e);
    if (i >= 0 && !slots[i]) { target.current = i; inp.current?.click(); }
  };
  const onWheel = (e: React.WheelEvent) => {
    const i = cellAt(e);
    if (i < 0 || !slots[i]) return;
    const f = fitOf(i);
    setSel(i);
    setFit(i, { ...f, zoom: Math.max(1, Math.min(4, f.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) });
  };
  // 휠로 확대할 때 화면이 같이 스크롤되지 않게
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const stop = (e: WheelEvent) => { if (photos.length) e.preventDefault(); };
    c.addEventListener('wheel', stop, { passive: false });
    return () => c.removeEventListener('wheel', stop);
  }, [photos.length]);

  const selPhoto = sel >= 0 ? slots[sel] : null;
  const removeSel = () => { if (!selPhoto) return; setPhotos(ps => ps.filter(p => p.id !== selPhoto.id)); };
  const moveSel = (dir: -1 | 1) => {
    const j = sel + dir;
    if (sel < 0 || j < 0 || j >= Math.max(n, photos.length)) return;
    setPhotos(ps => { const a = [...ps]; if (!a[sel] && !a[j]) return ps; [a[sel], a[j]] = [a[j], a[sel]]; return a.filter(Boolean); });
    setSel(Math.min(j, n - 1));
  };
  /** 대기 줄 사진을 고른 칸에 넣기 (자리 바꿈) */
  const putTray = (k: number) => {
    const t = sel >= 0 ? sel : slots.findIndex(s => !s);
    if (t < 0) { toast('바꿀 칸을 먼저 눌러 주세요'); return; }
    setPhotos(ps => { const a = [...ps]; [a[t], a[k]] = [a[k], a[t]]; return a.filter(Boolean); });
  };

  const save = async () => {
    if (!photos.length) { toast('사진을 먼저 넣어 주세요'); return; }
    setBusy(true);
    try {
      const LONG = 3000;
      const W = ratio >= 1 ? LONG : Math.round(LONG * ratio), H = ratio >= 1 ? Math.round(LONG / ratio) : LONG;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      drawCollage(c.getContext('2d')!, W, H, { layout, slots, fits: slots.map((_, i) => fitOf(i)), gapPct, radPct, bg });
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.95));
      if (!blob) throw new Error('이미지를 만들지 못했어요');
      const d = new Date();
      const name = `collage-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.jpg`;
      const file = new File([blob], name, { type: 'image/jpeg' });
      const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
      if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* 취소 */ }
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(`저장했어요 — ${W}×${H}px`);
      }
    } catch (e) {
      toast(`저장하지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href="/mypage">사진 콜라주</PageTitle><p>로그인 후 이용할 수 있습니다</p></div>
      </section>
    );
  }

  const tray = photos.slice(n);
  return (
    <section className="page cl-page">
      <div className="page-head">
        <PageTitle href="/mypage">사진 콜라주</PageTitle>
        <p>좋아하는 사진을 한 장으로 붙여요 · 사진은 이 브라우저에서만 쓰고 어디에도 올라가지 않아요</p>
      </div>

      <div className="cl-grid">
        <div className="cl-stage" ref={wrap}>
          <canvas ref={cv} style={{ width: size.w, height: size.h }} className={photos.length ? '' : 'empty'}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }} onWheel={onWheel} />
          <p className="cl-tip">{photos.length ? '칸을 끌어 위치를 맞추고, 휠이나 아래 막대로 확대해요 · 빈 칸을 누르면 사진을 넣어요' : '빈 칸을 누르거나 오른쪽에서 사진을 넣어 주세요'}</p>
          {tray.length > 0 && (
            <div className="cl-tray">
              <span>칸에 안 들어간 사진 {tray.length}장 · 누르면 고른 칸과 바꿔요</span>
              <div>
                {tray.map((p, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <button key={p.id} type="button" onClick={() => putTray(n + k)}><img src={p.url} alt="" /></button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="cl-side">
          <button type="button" className="btn btn-dark cl-add" onClick={() => { target.current = -1; inp.current?.click(); }}>＋ 사진 넣기 (여러 장)</button>
          <input ref={inp} type="file" accept="image/*" multiple hidden data-nocrop="" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />

          {selPhoto && (
            <div className="cl-sel">
              <div className="cl-h">고른 칸</div>
              <label className="cl-row"><span>확대</span>
                <input type="range" className="k-range" min={1} max={4} step={0.01} value={fitOf(sel).zoom}
                  onChange={e => setFit(sel, { ...fitOf(sel), zoom: Number(e.target.value) })} />
              </label>
              <div className="cl-btns">
                <button type="button" onClick={() => moveSel(-1)} disabled={sel <= 0}>← 앞으로</button>
                <button type="button" onClick={() => moveSel(1)} disabled={sel >= Math.max(n, photos.length) - 1}>뒤로 →</button>
                <button type="button" onClick={() => setFit(sel, FIT0)}>처음대로</button>
                <button type="button" className="danger" onClick={removeSel}>빼기</button>
              </div>
            </div>
          )}

          <div className="cl-h">배치</div>
          <div className="cl-layouts">
            {LAYOUTS.map(l => (
              <button key={l.id} type="button" className={layout.id === l.id ? 'on' : ''} onClick={() => { setLayout(l); setSel(-1); }}
                aria-label={`${l.cells.length}칸`}><LayoutIcon l={l} /></button>
            ))}
          </div>

          <div className="cl-h">판 비율</div>
          <div className="mini-seg">
            {RATIOS.map(([t, v]) => <button key={t} type="button" className={ratio === v ? 'on' : ''} onClick={() => setRatio(v)}>{t}</button>)}
          </div>

          <label className="cl-row"><span>간격</span>
            <input type="range" className="k-range" min={0} max={5} step={0.1} value={gapPct} onChange={e => setGapPct(Number(e.target.value))} />
          </label>
          <label className="cl-row"><span>모서리</span>
            <input type="range" className="k-range" min={0} max={6} step={0.1} value={radPct} onChange={e => setRadPct(Number(e.target.value))} />
          </label>
          <div className="cl-row"><span>바탕</span>
            <div className="cl-bgs">
              {BGS.map(c => <button key={c} type="button" className={bg === c ? 'on' : ''} style={{ background: c }} onClick={() => setBg(c)} aria-label={c} />)}
            </div>
          </div>

          <div className="cl-save">
            <button type="button" className="btn btn-dark" disabled={busy || !photos.length} onClick={() => { void save(); }}>
              {busy ? '만드는 중…' : '🖼 이미지로 저장'}
            </button>
            <small>긴 변 3000px 고화질 JPG · 사진 속 위치 정보 등은 담기지 않아요</small>
            {photos.length > 0 && (
              <button type="button" className="cl-clear" onClick={() => { if (confirm('넣은 사진을 모두 뺄까요?')) { setPhotos([]); setFits({}); setSel(-1); } }}>모두 비우기</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
