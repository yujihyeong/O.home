'use client';
// 발췌 카드 — 고른 문단을 이미지로 저장한다.
// 배경: 색 또는 이미지(기본 8장 + 직접 올리기) · 이미지는 밝기·블러 조절 / 글씨: 글씨체·색·크기.
// 미리보기도 저장본과 같은 캔버스로 그린다 — 보이는 그대로 저장된다.
// 고른 꾸밈은 이 브라우저에 기억해 두고 다음 발췌에도 쓴다.
import React, { useEffect, useRef, useState } from 'react';
import { useFonts } from '@/lib/fontStore';
import { KSelect } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useToast } from '@/components/ui/Toast';
import { stripImageMeta } from '@/lib/imageMeta';

export const EXCERPT_BGS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
  src: `/excerpt-bg/${n}.webp`, thumb: `/excerpt-bg/t${n}.webp`,
}));

interface CardStyle {
  bg: string;              // 배경색
  img: string | null;      // 배경 이미지 (기본 이미지 주소 또는 올린 이미지 data URL)
  bright: number;          // 밝기 % (30~150)
  blur: number;            // 블러 0~20
  fontId: string;          // 폰트 라이브러리 id ('' = 기본)
  color: string;           // 글씨색
  size: number;            // 글씨 크기 (1080px 폭 기준)
}
const DEF: CardStyle = { bg: '#f7f3ea', img: null, bright: 70, blur: 0, fontId: '', color: '#2c3037', size: 38 };
const KEY = 'ohome.excerptCard.v1';
const W = 1080;
const PAD = 96;

const loadStyle = (): CardStyle => {
  try { return { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CardStyle>) }; } catch { return DEF; }
};
const saveStyle = (s: CardStyle) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {
    // 올린 이미지가 커서 못 담으면 이미지만 빼고 기억한다
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, img: s.img?.startsWith('data:') ? null : s.img })); } catch { /* 무시 */ }
  }
};

/** CSS 변수(var(--sans-base) 등)는 캔버스가 모른다 — 실제 글꼴 이름으로 풀어 준다 */
function canvasFamily(fam: string | undefined): string {
  const css = getComputedStyle(document.documentElement);
  let f = fam || 'var(--sans-base)';
  for (let i = 0; i < 4 && f.includes('var('); i++) {
    f = f.replace(/var\((--[\w-]+)\)/g, (_, v: string) => css.getPropertyValue(v).trim() || 'sans-serif');
  }
  return f;
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('이미지를 불러오지 못했습니다'));
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** 글자 단위 줄바꿈 (한글은 띄어쓰기 없이도 끊긴다 — 영어 단어는 되도록 통째로) */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    const tokens = raw.match(/[A-Za-z0-9'’.,!?-]+\s*|\s+|./gu) ?? [];
    for (const t of tokens) {
      // 쉼표·마침표·닫는 따옴표는 줄 맨 앞으로 넘기지 않는다 — 살짝 넘쳐도 앞 줄에 붙인다
      if (line && /^[,.!?;:、。」』)\]}"'”’…~]/.test(t) && ctx.measureText(line + t.trimEnd()).width <= max + ctx.measureText('，，').width) {
        line += t;
        continue;
      }
      if (ctx.measureText(line + t).width <= max || !line) {
        if (ctx.measureText(t).width > max) {   // 혼자서도 넘치는 긴 단어 — 글자씩
          for (const ch of t) {
            if (ctx.measureText(line + ch).width > max && line) { out.push(line); line = ''; }
            line += ch;
          }
        } else line += t;
      } else {
        out.push(line.trimEnd());
        line = t.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** 상자 블러를 가로·세로로 3번 — 가우스 블러와 거의 같은 부드러운 흐림 (모든 브라우저에서 똑같이) */
function gaussBlur(img: ImageData, sigma: number) {
  const { width: w, height: h, data } = img;
  // 표준편차 sigma에 맞는 상자 3개 크기 (Kovesi 방식)
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii = [0, 1, 2].map(i => ((i < m ? wl : wl + 2) - 1) / 2);
  const a = new Float32Array(w * h * 3), b = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { a[j] = data[i]; a[j + 1] = data[i + 1]; a[j + 2] = data[i + 2]; }
  const pass = (src: Float32Array, dst: Float32Array, r: number, horiz: boolean) => {
    if (r < 1) { dst.set(src); return; }
    const len = horiz ? w : h, lines = horiz ? h : w;
    const step = (horiz ? 1 : w) * 3, iarr = 1 / (r + r + 1);
    for (let line = 0; line < lines; line++) {
      const base = (horiz ? line * w : line) * 3;
      for (let c = 0; c < 3; c++) {
        const at = (k: number) => src[base + Math.min(len - 1, Math.max(0, k)) * step + c];   // 가장자리는 끝 픽셀
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += at(k);
        for (let k = 0; k < len; k++) {
          dst[base + k * step + c] = acc * iarr;
          acc += at(k + r + 1) - at(k - r);
        }
      }
    }
  };
  for (const r of radii) { pass(a, b, Math.round(r), true); pass(b, a, Math.round(r), false); }
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { data[i] = a[j]; data[i + 1] = a[j + 1]; data[i + 2] = a[j + 2]; data[i + 3] = 255; }
}

/** 카드를 캔버스에 그린다 — 높이는 글 길이에 맞추되 정사각형보다 작아지지 않게 */
async function draw(canvas: HTMLCanvasElement, paras: string[], source: string, st: CardStyle, family: string) {
  const ctx = canvas.getContext('2d')!;
  const font = `${st.size}px ${family}`;
  const small = `${Math.round(st.size * 0.62)}px ${family}`;
  try { await Promise.all([document.fonts.load(font, paras.join('')), document.fonts.load(small, source)]); } catch { /* 기본 글꼴로 */ }
  ctx.font = font;
  const lh = st.size * 1.75;
  const lines = paras.map(p => wrap(ctx, p, W - PAD * 2));
  const textH = lines.reduce((n, l) => n + l.length * lh, 0) + (paras.length - 1) * st.size * 0.9;
  const srcH = st.size * 2.2;
  const H = Math.max(W, Math.ceil(textH + srcH + PAD * 2));
  canvas.width = W; canvas.height = H;

  // 배경
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, W, H);
  if (st.img) {
    try {
      const im = await loadImg(st.img);
      // 꽉 채우기(cover) — 이미지 크기·위치는 블러와 상관없이 그대로
      const k = Math.max(W / im.width, H / im.height);
      const dw = im.width * k, dh = im.height * k;
      ctx.imageSmoothingQuality = 'high';
      if (!st.blur) {
        ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        // 부드러운 블러 — 반 크기에서 가우스에 가까운 흐림(상자 블러 3번)을 건 뒤 원래 크기로.
        // 가장자리는 끝 픽셀을 이어 써서 확대하지 않아도 테두리가 비치지 않는다
        const q = 0.5;
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(W * q); tmp.height = Math.round(H * q);
        const tc = tmp.getContext('2d')!;
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(im, (W - dw) / 2 * q, (H - dh) / 2 * q, dw * q, dh * q);
        const data = tc.getImageData(0, 0, tmp.width, tmp.height);
        gaussBlur(data, st.blur * 3 * q);
        tc.putImageData(data, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);
      }
      // 밝기 — 어둡게는 검정, 밝게는 흰색을 덮는다
      if (st.bright < 100) { ctx.fillStyle = `rgba(0,0,0,${(100 - st.bright) / 100})`; ctx.fillRect(0, 0, W, H); }
      if (st.bright > 100) { ctx.fillStyle = `rgba(255,255,255,${(st.bright - 100) / 100 * 0.8})`; ctx.fillRect(0, 0, W, H); }
    } catch { /* 이미지 없이 색 배경으로 */ }
  }

  // 글
  ctx.fillStyle = st.color;
  ctx.textBaseline = 'top';
  if (st.img) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 10; }
  let y = (H - textH - srcH) / 2;
  ctx.font = font;
  lines.forEach((ls, i) => {
    if (i) y += st.size * 0.9;
    for (const l of ls) { ctx.fillText(l, PAD, y + (lh - st.size) / 2); y += lh; }
  });
  ctx.font = small;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'right';
  ctx.fillText(source, W - PAD, y + st.size * 1.2);
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.shadowBlur = 0;
}

export function ExcerptCard({ paras, source, fileName }: { paras: string[]; source: string; fileName: string }) {
  const toast = useToast();
  const { fonts, familyOf } = useFonts();
  const [st, setSt] = useState<CardStyle>(DEF);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSt(loadStyle()); setReady(true); }, []);
  const set = (p: Partial<CardStyle>) => setSt(s => { const n = { ...s, ...p }; saveStyle(n); return n; });

  const family = typeof window === 'undefined' ? '' : canvasFamily(st.fontId ? familyOf(st.fontId) : undefined);
  useEffect(() => {
    if (!ready || !ref.current) return;
    let alive = true;
    const c = document.createElement('canvas');
    void draw(c, paras, source, st, family).then(() => {
      // 다 그린 다음에 한 번에 옮긴다 — 그리는 도중의 빈 화면이 깜빡이지 않게
      const v = ref.current;
      if (!alive || !v) return;
      v.width = c.width; v.height = c.height;
      v.getContext('2d')!.drawImage(c, 0, 0);
    });
    return () => { alive = false; };
  }, [ready, paras, source, st, family]);

  const upload = async (f?: File) => {
    if (!f) return;
    try {
      // 메타데이터 없이, 1080px로 줄여서 — 이 브라우저 안에만 둔다 (서버에 올리지 않음)
      const clean = await stripImageMeta(f);
      const url = URL.createObjectURL(clean);
      const im = await loadImg(url);
      const k = Math.min(1, 1440 / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); imgCache.delete(url);
      set({ img: c.toDataURL('image/jpeg', 0.86) });
    } catch (e) {
      toast(`이미지를 넣지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      await draw(c, paras, source, st, family);
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('이미지를 만들지 못했습니다');
      const name = `${fileName.replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) || '발췌'}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      // 휴대폰은 공유 시트로 (사진에 저장), 컴퓨터는 내려받기
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* 취소 */ }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('이미지로 저장했습니다');
      }
    } catch (e) {
      toast(`저장하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const isUp = !!st.img?.startsWith('data:');
  return (
    <div className="exc">
      <div className="exc-prev"><canvas ref={ref} /></div>
      <div className="exc-ctl">
        <div className="exc-row">
          <label>배경</label>
          <div className="exc-bgs">
            <button type="button" className={`exc-sw ${!st.img ? 'on' : ''}`} style={{ background: st.bg }}
              onClick={() => set({ img: null })} data-tip="색 배경" />
            {EXCERPT_BGS.map(b => (
              <button key={b.src} type="button" className={`exc-sw ${st.img === b.src ? 'on' : ''}`}
                style={{ backgroundImage: `url(${b.thumb})` }} onClick={() => set({ img: b.src })} />
            ))}
            <button type="button" className={`exc-sw exc-up ${isUp ? 'on' : ''}`}
              style={isUp ? { backgroundImage: `url(${st.img})` } : undefined}
              onClick={() => fileRef.current?.click()} data-tip="내 이미지 올리기">{isUp ? '' : '＋'}</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f); }} />
          </div>
        </div>
        {st.img ? (
          <>
            <div className="exc-row">
              <label>밝기</label>
              <input type="range" className="k-range" min={30} max={150} value={st.bright}
                onChange={e => set({ bright: Number(e.target.value) })} />
              <span className="exc-v">{st.bright}%</span>
            </div>
            <div className="exc-row">
              <label>블러</label>
              <input type="range" className="k-range" min={0} max={20} value={st.blur}
                onChange={e => set({ blur: Number(e.target.value) })} />
              <span className="exc-v">{st.blur}</span>
            </div>
          </>
        ) : (
          <div className="exc-row"><label>배경색</label><ColorField value={st.bg} onChange={bg => set({ bg })} /></div>
        )}
        <div className="exc-row">
          <label>글씨체</label>
          <KSelect minWidth={170} value={st.fontId} onChange={fontId => set({ fontId })}
            options={[{ value: '', label: '기본' },
              ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))]} />
        </div>
        <div className="exc-row">
          <label>글씨색</label><ColorField value={st.color} onChange={color => set({ color })} />
          <span className="exc-quick">
            <button type="button" style={{ background: '#ffffff' }} onClick={() => set({ color: '#ffffff' })} data-tip="흰색" />
            <button type="button" style={{ background: '#2c3037' }} onClick={() => set({ color: '#2c3037' })} data-tip="검정" />
          </span>
        </div>
        <div className="exc-row">
          <label>크기</label>
          <input type="range" className="k-range" min={24} max={64} value={st.size}
            onChange={e => set({ size: Number(e.target.value) })} />
          <span className="exc-v">{st.size}</span>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="btn btn-dark" disabled={busy} onClick={() => { void save(); }}>
          {busy ? '만드는 중…' : '🖼 이미지로 저장'}
        </button>
      </div>
    </div>
  );
}
