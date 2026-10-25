'use client';
// 발췌 카드 — 고른 문단을 이미지로 저장한다.
// 배경: 색 또는 이미지(기본 8장 + 직접 올리기) · 이미지는 밝기·블러 조절 / 글씨: 글씨체·색·크기.
// 미리보기도 저장본과 같은 캔버스로 그린다 — 보이는 그대로 저장된다.
// 고른 꾸밈은 이 브라우저에 기억해 두고 다음 발췌에도 쓴다.
// 사진 따로 넣기 (사용자 요청): 배경과 별개로 2.5:1 사진 한 장 — 가로 띠는 글 위에, 세로 띠는 글 왼쪽에.
// 배경 이미지와 같이 쓰면 흐린 배경 위에 사진과 글이 올라간다 (시안 B · E).
// 거리측정 HUD 배경 (사용자 요청 — 저격수 테마, 어두운 색) · 트위터식 발췌 (한 트윗에 길게, 사용자 요청)
import React, { useEffect, useRef, useState } from 'react';
import { useFonts } from '@/lib/fontStore';
import { KSelect } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useToast } from '@/components/ui/Toast';
import { stripImageMeta } from '@/lib/imageMeta';
import { gaussBlur } from '@/lib/blur';

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
  hl: string;              // 형광펜 색
  photoDir?: 'none' | 'h' | 'v';   // 따로 넣는 사진 — 없음 / 가로 띠(글 위) / 세로 띠(글 옆)
  photo?: string | null;   // 그 사진 (올린 이미지 data URL)
  speakers?: Speaker[];    // 대사 말풍선의 발화자 (사용자 요청)
  kind?: 'card' | 'tweet'; // 모양 — 카드 / 트위터식
  deco?: 'hud' | null;     // 그려 넣는 꾸밈 배경 — 거리측정 HUD
  hud?: string[];          // HUD 네 귀퉁이 작은 글씨 (왼쪽 위 · 오른쪽 위 · 왼쪽 아래 · 오른쪽 아래, 비우면 숨김)
  tw?: Partial<TweetConf>;
}
/** 트위터식 발췌 — 이름 자리는 글 제목, 나머지는 직접 고친다 */
interface TweetConf {
  handle: string; time: string; dark: boolean;
  av: string | null;       // 프로필 사진 (올린 이미지 data URL)
  avColor: string;         // 사진이 없을 때 동그라미 색
  n: string[];             // 답글 · 리트윗 · 마음 · 조회수
}
const TW_DEF: TweetConf = { handle: 'yujihyeong', time: '2시', dark: false, av: null, avColor: '#9aa7b4', n: ['1', '', '5', '81'] };
export const HUD_DEF = ['RNG 812M', 'WIND 3.2 ←', 'ELEV +2.4', 'REC'];
const HUD_INK = '#e4e6e3';

/* ---------- 대사 말풍선 (사용자 요청 — 시안 A: 이름이 말풍선 위) ----------
   앞뒤가 따옴표인 문단은 발화자를 고르면 그 사람 색의 파스텔 말풍선으로, 왼쪽·오른쪽에 붙여 그린다 */
export interface Speaker { id: string; name: string; color: string }
export const DEFAULT_SPEAKERS: Speaker[] = [
  { id: 'dove', name: '도브', color: '#d9606b' },
  { id: 'sio', name: '시오', color: '#5b8fd9' },
  { id: 'jsw', name: '지선우', color: '#55a560' },
  { id: 'cym', name: '춘열망', color: '#9070d0' },
];
export interface Talk { who: string | null; side: 'l' | 'r' }
const OPEN_Q = /^\s*["“「『'‘]/, CLOSE_Q = /["”」』'’]\s*$/;
/** 문단 전체가 따옴표로 감싸여 있는가 — 대사 */
export const isQuote = (t: string) => OPEN_Q.test(t) && CLOSE_Q.test(t) && t.trim().length > 2;
/** 색 섞기 — 파스텔(흰색과) · 이름 글씨(검정과) */
function mix(hex: string, to: number, k: number) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (to - v) * k));
  return `rgb(${c.join(',')})`;
}
export const pastelOf = (hex: string) => mix(hex, 255, 0.72);
export const nameInkOf = (hex: string) => mix(hex, 0, 0.18);
/** 말풍선 안에는 따옴표 없이 */
function stripQuotes(runs: Run[]): Run[] {
  const out = runs.map(r => ({ ...r }));
  if (out.length) out[0].t = out[0].t.replace(OPEN_Q, '');
  if (out.length) out[out.length - 1].t = out[out.length - 1].t.replace(CLOSE_Q, '');
  return out;
}
const DEF: CardStyle = { bg: '#f7f3ea', img: null, bright: 70, blur: 0, fontId: '', color: '#2c3037', size: 38, hl: '#ffe066' };

/* ---------- 문장 꾸미기 — 굵게 · 기울임 · 형광펜 (사용자 요청) ----------
   문단마다 글 조각(run)의 목록으로 들고 있는다. 드래그한 범위에 켜고/끄고, 캔버스는 조각마다 글꼴을 바꿔 그린다 */
export interface Run { t: string; b?: boolean; i?: boolean; h?: boolean }
type Mark = 'b' | 'i' | 'h';
const same = (a: Run, b: Run) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.h === !!b.h;
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && same(last, r)) last.t += r.t; else out.push({ ...r });
  }
  return out.length ? out : [{ t: '' }];
}
/** from~to 글자 범위가 조각 경계가 되게 쪼갠다 */
function splitAt(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const a = pos, b = pos + r.t.length;
    const cuts = [a, Math.max(a, Math.min(b, from)), Math.max(a, Math.min(b, to)), b];
    for (let k = 0; k < 3; k++) if (cuts[k + 1] > cuts[k]) out.push({ ...r, t: r.t.slice(cuts[k] - a, cuts[k + 1] - a) });
    pos = b;
  }
  return out;
}
/** 범위 안이 모두 켜져 있으면 끄고, 아니면 켠다 */
function toggleMark(runs: Run[], from: number, to: number, m: Mark): Run[] {
  const parts = splitAt(runs, from, to);
  let pos = 0;
  const inRange: Run[] = [];
  parts.forEach(r => { if (pos >= from && pos + r.t.length <= to && r.t) inRange.push(r); pos += r.t.length; });
  const on = !inRange.every(r => r[m]);
  pos = 0;
  return merge(parts.map(r => {
    const hit = pos >= from && pos + r.t.length <= to;
    pos += r.t.length;
    return hit ? { ...r, [m]: on || undefined } : r;
  }));
}

const KEY = 'ohome.excerptCard.v1';
const W = 1080;
const PAD = 96;
/* 따로 넣는 사진 — 비율 2.5:1(가로 띠) / 1:2.5(세로 띠) */
const PHOTO_RATIO = 2.5;
const PM = 72;          // 사진 바깥 여백
const PGAP_H = 64;      // 가로 띠와 글 사이
const PGAP_V = 56;      // 세로 띠와 글 사이
const PW_V = 300;       // 세로 띠 폭

/** 둥근 모서리로 잘라 꽉 채워(cover) 그린다 */
function drawCover(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(w / im.width, h / im.height);
  const sw = w / k, sh = h / k;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

const loadStyle = (): CardStyle => {
  try { return { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CardStyle>) }; } catch { return DEF; }
};
const saveStyle = (s: CardStyle) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {
    // 올린 이미지가 커서 못 담으면 이미지만 빼고 기억한다
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, img: s.img?.startsWith('data:') ? null : s.img, photo: null, tw: { ...s.tw, av: null } })); } catch { /* 무시 */ }
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
interface Piece { t: string; r: Run }
/** 글자 단위 줄바꿈 — 조각마다 글꼴이 달라 조각별로 잰다 (한글은 띄어쓰기 없이도 끊긴다 — 영어 단어는 되도록 통째로) */
function wrap(ctx: CanvasRenderingContext2D, runs: Run[], max: number, fontOf: (r: Run) => string): Piece[][] {
  const lines: Piece[][] = [];
  let line: Piece[] = [], w = 0;
  const m = (t: string, r: Run) => { ctx.font = fontOf(r); return ctx.measureText(t).width; };
  const push = () => {
    // 줄 끝 공백은 떼어 낸다
    while (line.length && !line[line.length - 1].t.trimEnd()) line.pop();
    if (line.length) line[line.length - 1] = { ...line[line.length - 1], t: line[line.length - 1].t.trimEnd() };
    lines.push(line); line = []; w = 0;
  };
  const add = (t: string, r: Run) => {
    if (!line.length) t = t.trimStart();
    if (!t) return;
    line.push({ t, r }); w += m(t, r);
  };
  for (const r of runs) {
    const parts = r.t.split('\n');
    parts.forEach((raw, pi) => {
      if (pi) push();
      const tokens = raw.match(/[A-Za-z0-9'’.,!?-]+\s*|\s+|./gu) ?? [];
      for (const t of tokens) {
        const tw = m(t, r);
        // 쉼표·마침표·닫는 따옴표는 줄 맨 앞으로 넘기지 않는다 — 살짝 넘쳐도 앞 줄에 붙인다
        if (line.length && /^[,.!?;:、。」』)\]}"'”’…~]/.test(t) && w + m(t.trimEnd(), r) <= max + m('，，', r)) { add(t, r); continue; }
        if (w + tw <= max || !line.length) {
          if (tw > max) {   // 혼자서도 넘치는 긴 단어 — 글자씩
            for (const ch of t) { if (w + m(ch, r) > max && line.length) push(); add(ch, r); }
          } else add(t, r);
        } else { push(); add(t, r); }
      }
    });
  }
  push();
  return lines;
}

/** 한 줄 그리기 — 형광펜 먼저(글자 아래쪽 2/3쯤만 칠해 손으로 그은 느낌), 그 위에 글자.
 *  이어진 형광펜 조각은 한 번에 칠한다 — 조각마다 칠하면 겹친 곳이 진해져 줄무늬가 생긴다 */
function paintLine(ctx: CanvasRenderingContext2D, l: Piece[], textX: number, y: number, lh: number, size: number,
  fontOf: (r: Run) => string, hl: string, ink: string) {
  let x = textX, hs: number | null = null;
  const sh = ctx.shadowBlur;
  const stroke = (from: number, to: number) => {
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.6; ctx.fillStyle = hl;
    ctx.fillRect(from - 3, y + lh * 0.38, to - from + 6, lh * 0.46);
    ctx.globalAlpha = 1; ctx.shadowBlur = sh;
  };
  for (const pc of l) {
    ctx.font = fontOf(pc.r);
    const w = ctx.measureText(pc.t).width;
    if (pc.r.h && hs === null) hs = x;
    if (!pc.r.h && hs !== null) { stroke(hs, x); hs = null; }
    x += w;
  }
  if (hs !== null) stroke(hs, x);
  x = textX;
  ctx.fillStyle = ink;
  for (const pc of l) {
    ctx.font = fontOf(pc.r);
    ctx.fillText(pc.t, x, y + (lh - size) / 2);
    x += ctx.measureText(pc.t).width;
  }
}

const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace';
/* 거리측정 HUD (사용자 확정 — 어두운 색) — 네 모서리 표시 · 위 가운데 작은 십자 · 오른쪽 눈금(5칸마다 긴 눈금, 글 길이만큼) · 귀퉁이 작은 글씨 */
const HUD = { bg: '#1d2124', sub: '#7d8588', acc: '#d0575f', padL: 137, padR: 170, padY: 210 };
function drawHud(ctx: CanvasRenderingContext2D, H: number, labels: string[]) {
  ctx.save();
  ctx.fillStyle = HUD.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = HUD_INK; ctx.lineCap = 'butt';
  // 모서리 표시
  const o = 58, L = 58;
  ctx.globalAlpha = 0.75; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(o, o + L); ctx.lineTo(o, o); ctx.lineTo(o + L, o);
  ctx.moveTo(W - o - L, o); ctx.lineTo(W - o, o); ctx.lineTo(W - o, o + L);
  ctx.moveTo(o, H - o - L); ctx.lineTo(o, H - o); ctx.lineTo(o + L, H - o);
  ctx.moveTo(W - o - L, H - o); ctx.lineTo(W - o, H - o); ctx.lineTo(W - o, H - o - L);
  ctx.stroke();
  // 위 가운데 작은 십자
  ctx.globalAlpha = 0.6; ctx.lineWidth = 3.6;
  const cy = 95;
  ctx.beginPath(); ctx.moveTo(W / 2, cy - 16); ctx.lineTo(W / 2, cy + 16); ctx.moveTo(W / 2 - 16, cy); ctx.lineTo(W / 2 + 16, cy); ctx.stroke();
  // 오른쪽 눈금
  const rx = W - 86, top = 223, bot = H - 223;
  ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(rx, top); ctx.lineTo(rx, bot);
  for (let i = 0, yy = top; yy <= bot + 0.5; i++, yy += 29) { ctx.moveTo(rx, yy); ctx.lineTo(rx - (i % 5 === 0 ? 25 : 14), yy); }
  ctx.stroke();
  // 귀퉁이 작은 글씨 — 마지막(오른쪽 아래)은 빨간 점(녹화 표시)과 함께
  ctx.globalAlpha = 1; ctx.fillStyle = HUD.sub; ctx.textBaseline = 'middle';
  ctx.font = `30px ${MONO}`;
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3.6px'; } catch { /* 무시 */ }
  const [tl, tr, bl, br] = [0, 1, 2, 3].map(i => (labels[i] ?? '').trim());
  const ly = 87, X = 144;
  ctx.textAlign = 'left';
  if (tl) ctx.fillText(tl, X, ly);
  if (bl) ctx.fillText(bl, X, H - ly);
  ctx.textAlign = 'right';
  if (tr) ctx.fillText(tr, W - X, ly);
  if (br) {
    ctx.fillText(br, W - X, H - ly);
    const bw = ctx.measureText(br).width;
    ctx.fillStyle = HUD.acc;
    ctx.beginPath(); ctx.arc(W - X - bw - 18, H - ly, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; } catch { /* 무시 */ }
}

/* 트위터식 발췌 (사용자 확정 — 한 트윗에 길게) — 프로필 · 제목 @아이디 · 시간 · 본문 · 아이콘 줄 */
const TW_ICONS = {
  rp: ['M4 11.5a7.5 7 0 0 1 7.5-7h1a7.5 7 0 0 1 0 15H8l-4 3v-4.5a7 7 0 0 1 0-6.5z'],
  rt: ['M3 8.5 6 5.5l3 3', 'M6 5.5v10.5a2.5 2.5 0 0 0 2.5 2.5H13', 'M21 15.5l-3 3-3-3', 'M18 18.5V8a2.5 2.5 0 0 0-2.5-2.5H11'],
  lk: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'],
  vw: ['M5 20V12M10 20V5M15 20v-9M20 20v-5'],
  bm: ['M6.5 4h11v16L12 16l-5.5 4z'],
  sh: ['M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v5h14v-5'],
};
function drawIcon(ctx: CanvasRenderingContext2D, d: string[], x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of d) ctx.stroke(new Path2D(p));
  ctx.restore();
}
async function drawTweet(canvas: HTMLCanvasElement, paras: Run[][], name: string, st: CardStyle, family: string, scale: number) {
  const ctx = canvas.getContext('2d')!;
  const tw = { ...TW_DEF, ...st.tw };
  const ink = tw.dark ? '#e7e9ea' : '#0f1419', sub = tw.dark ? '#71767b' : '#536471';
  const fs = Math.round(st.size * 1.2);
  const fontOf = (r: Run) => `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${fs}px ${family}`;
  const hs = Math.round(fs * 0.95), cs = Math.round(fs * 0.8);
  const all = paras.map(p => p.map(r => r.t).join('')).join('');
  try {
    await Promise.all([document.fonts.load(`${fs}px ${family}`, all), document.fonts.load(`bold ${hs}px ${family}`, name),
      document.fonts.load(`bold ${fs}px ${family}`, all), document.fonts.load(`italic ${fs}px ${family}`, all)]);
  } catch { /* 기본 글꼴로 */ }
  let av: HTMLImageElement | null = null;
  if (tw.av) { try { av = await loadImg(tw.av); } catch { av = null; } }
  const P = 64, AV = 132, cx = P + AV + 36, cw = W - cx - P;
  const lh = fs * 1.45, headH = hs * 1.4, ic = Math.round(fs * 0.95);
  const lines = paras.map(p => wrap(ctx, p, cw, fontOf));
  const bodyH = lines.reduce((n, l, i) => n + l.length * lh + (i ? lh : 0), 0);
  const bodyTop = P + headH + fs * 0.2;
  const actTop = bodyTop + bodyH + fs * 0.75;
  const H = Math.ceil(Math.max(actTop + ic + P * 0.9, P * 2 + AV));
  const S = Math.max(1, Math.min(scale, Math.sqrt(16_000_000 / (W * H))));
  canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = tw.dark ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // 프로필 — 사진 또는 색 동그라미 (글씨 없음)
  if (av) { ctx.imageSmoothingQuality = 'high'; drawCover(ctx, av, P, P, AV, AV, AV / 2); }
  else { ctx.fillStyle = tw.avColor; ctx.beginPath(); ctx.arc(P + AV / 2, P + AV / 2, AV / 2, 0, Math.PI * 2); ctx.fill(); }
  // 제목 @아이디 · 시간 — 넘치면 잘라 낸다
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.beginPath(); ctx.rect(cx, P, cw, headH); ctx.clip();
  const hy = P + headH / 2;
  ctx.font = `bold ${hs}px ${family}`; ctx.fillStyle = ink;
  ctx.fillText(name, cx, hy);
  const nw = ctx.measureText(name).width;
  const meta = [tw.handle.trim() ? `@${tw.handle.trim().replace(/^@+/, '')}` : '', tw.time.trim()].filter(Boolean).join(' · ');
  ctx.font = `${hs}px ${family}`; ctx.fillStyle = sub;
  if (meta) ctx.fillText(meta, cx + nw + hs * 0.35, hy);
  ctx.restore();
  // 본문
  ctx.textBaseline = 'top';
  let y = bodyTop;
  lines.forEach((ls, i) => {
    if (i) y += lh;
    for (const l of ls) { paintLine(ctx, l, cx, y, lh, fs, fontOf, st.hl, ink); y += lh; }
  });
  // 아이콘 줄 — 답글 · 리트윗 · 마음 · 조회수 … 북마크 · 공유
  ctx.textBaseline = 'middle'; ctx.font = `${cs}px ${family}`;
  const step = cw * 0.215;
  (['rp', 'rt', 'lk', 'vw'] as const).forEach((k, i) => {
    const x = cx + i * step;
    drawIcon(ctx, TW_ICONS[k], x, actTop, ic, sub);
    const n = (tw.n[i] ?? '').trim();
    if (n) { ctx.fillStyle = sub; ctx.fillText(n, x + ic + cs * 0.3, actTop + ic / 2 + 1); }
  });
  drawIcon(ctx, TW_ICONS.bm, cx + cw - ic * 2.9, actTop, ic, sub);
  drawIcon(ctx, TW_ICONS.sh, cx + cw - ic, actTop, ic, sub);
}

/** 카드를 캔버스에 그린다 — 높이는 글 길이에 맞추되 정사각형보다 작아지지 않게.
 *  scale: 실제 픽셀 배율 — 미리보기는 1, 저장은 2(고화질, 사용자 요청). 좌표는 전부 1배 기준으로 쓰고 변환으로 키운다 */
async function draw(canvas: HTMLCanvasElement, paras: Run[][], source: string, st: CardStyle, family: string, scale = 1, talk: (Talk | undefined)[] = [], title = '') {
  if (st.kind === 'tweet') return drawTweet(canvas, paras, title || source, st, family, scale);
  const ctx = canvas.getContext('2d')!;
  const hud = st.deco === 'hud';
  const font = `${st.size}px ${family}`;
  const fontOf = (r: Run) => `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${st.size}px ${family}`;
  const small = `${Math.round(st.size * 0.62)}px ${family}`;
  const all = paras.map(p => p.map(r => r.t).join('')).join('');
  try {
    await Promise.all([document.fonts.load(font, all), document.fonts.load(small, source),
      document.fonts.load(`bold ${font}`, all), document.fonts.load(`italic ${font}`, all)]);
  } catch { /* 기본 글꼴로 */ }
  ctx.font = font;
  const lh = st.size * 1.75;
  // 따로 넣는 사진
  let ph: HTMLImageElement | null = null;
  if (!hud && st.photo && st.photoDir && st.photoDir !== 'none') { try { ph = await loadImg(st.photo); } catch { ph = null; } }
  const vert = !!ph && st.photoDir === 'v';
  const textX = hud ? HUD.padL : vert ? PM + PW_V + PGAP_V : PAD;
  const textW = hud ? W - HUD.padL - HUD.padR : vert ? W - textX - PAD : W - PAD * 2;
  // 대사 말풍선 — 발화자를 고른 따옴표 문단만
  const speakers = st.speakers ?? DEFAULT_SPEAKERS;
  const bub = paras.map((p, i) => {
    const t = talk[i];
    const sp = t?.who ? speakers.find(x => x.id === t.who) : undefined;
    return sp && isQuote(p.map(r => r.t).join('')) ? { sp, side: t!.side } : null;
  });
  const padX = st.size * 0.62, padY = st.size * 0.34;
  const nameSize = Math.round(st.size * 0.62), nameH = nameSize * 1.5;
  const bubMax = textW * 0.8;
  const lines = paras.map((p, i) => (bub[i] ? wrap(ctx, stripQuotes(p), bubMax - padX * 2, fontOf) : wrap(ctx, p, textW, fontOf)));
  const blockH = (i: number) => (bub[i] ? nameH + lines[i].length * lh + padY * 2 : lines[i].length * lh);
  // 말풍선끼리는 조금 더 붙여서 대화처럼
  const gapBefore = (i: number) => (i === 0 ? 0 : bub[i] && bub[i - 1] ? st.size * 0.5 : st.size * 0.9);
  const textH = lines.reduce((n, _l, i) => n + blockH(i) + gapBefore(i), 0);
  const srcH = st.size * 2.2;
  let H: number, textTop: number, photoRect: { x: number; y: number; w: number; h: number } | null = null;
  if (ph && !vert) {
    // 가로 띠 — 사진 + 글을 한 덩어리로 가운데
    const pw = W - PM * 2, phH = Math.round(pw / PHOTO_RATIO);
    const total = phH + PGAP_H + textH + srcH;
    H = Math.max(W, Math.ceil(total + PM + PAD));
    const top = Math.max(PM, (H - total) / 2);
    photoRect = { x: PM, y: top, w: pw, h: phH };
    textTop = top + phH + PGAP_H;
  } else if (ph) {
    // 세로 띠 — 사진은 왼쪽, 글은 오른쪽, 둘 다 세로 가운데
    const phH = Math.round(PW_V * PHOTO_RATIO);
    H = Math.max(W, phH + PM * 2, Math.ceil(textH + srcH + PAD * 2));
    photoRect = { x: PM, y: (H - phH) / 2, w: PW_V, h: phH };
    textTop = (H - textH - srcH) / 2;
  } else {
    const pad = hud ? HUD.padY : PAD;
    H = Math.max(W, Math.ceil(textH + srcH + pad * 2));
    textTop = (H - textH - srcH) / 2;
  }
  // 아주 긴 글이면 휴대폰 캔버스 한도(약 1,600만 화소)를 넘지 않게 배율을 낮춘다
  const S = Math.max(1, Math.min(scale, Math.sqrt(16_000_000 / (W * H))));
  canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = true;

  // 배경
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, W, H);
  if (hud) drawHud(ctx, H, st.hud ?? HUD_DEF);
  else if (st.img) {
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
        const qs = q * S;
        tmp.width = Math.round(W * qs); tmp.height = Math.round(H * qs);
        const tc = tmp.getContext('2d')!;
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(im, (W - dw) / 2 * qs, (H - dh) / 2 * qs, dw * qs, dh * qs);
        const data = tc.getImageData(0, 0, tmp.width, tmp.height);
        gaussBlur(data, st.blur * 3 * qs);
        tc.putImageData(data, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);
      }
      // 밝기 — 어둡게는 검정, 밝게는 흰색을 덮는다
      if (st.bright < 100) { ctx.fillStyle = `rgba(0,0,0,${(100 - st.bright) / 100})`; ctx.fillRect(0, 0, W, H); }
      if (st.bright > 100) { ctx.fillStyle = `rgba(255,255,255,${(st.bright - 100) / 100 * 0.8})`; ctx.fillRect(0, 0, W, H); }
    } catch { /* 이미지 없이 색 배경으로 */ }
  }

  // 따로 넣은 사진 — 배경 이미지 위에서는 그림자로 띄운다
  if (ph && photoRect) {
    const { x, y, w, h } = photoRect;
    if (st.img) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 36 * S; ctx.shadowOffsetY = 14 * S;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill();
      ctx.restore();
    }
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, ph, x, y, w, h, 18);
  }

  // 글
  ctx.fillStyle = st.color;
  ctx.textBaseline = 'top';
  if (st.img && !hud) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 10 * S; }   // 그림자 흐림은 변환을 따르지 않아 배율을 직접 곱한다
  let y = textTop;
  const drawLine = (l: Piece[], textX: number, ink: string) => { paintLine(ctx, l, textX, y, lh, st.size, fontOf, st.hl, ink); y += lh; };
  const lineW = (l: Piece[]) => l.reduce((n, pc) => { ctx.font = fontOf(pc.r); return n + ctx.measureText(pc.t).width; }, 0);
  lines.forEach((ls, i) => {
    y += gapBefore(i);
    const b = bub[i];
    if (!b) { for (const l of ls) drawLine(l, textX, st.color); return; }
    // 이름(말풍선 위) → 파스텔 말풍선 → 글
    const bw = Math.max(...ls.map(lineW), st.size) + padX * 2;
    const bx = b.side === 'r' ? textX + textW - bw : textX;
    const sh = ctx.shadowBlur;
    ctx.font = `bold ${nameSize}px ${family}`;
    ctx.fillStyle = st.img ? '#ffffff' : nameInkOf(b.sp.color);
    ctx.textAlign = b.side === 'r' ? 'right' : 'left';
    ctx.fillText(b.sp.name, b.side === 'r' ? bx + bw - st.size * 0.3 : bx + st.size * 0.3, y);
    ctx.textAlign = 'left';
    y += nameH;
    const bh = ls.length * lh + padY * 2;
    const R = st.size * 0.75, r = st.size * 0.22;
    ctx.shadowBlur = st.img ? 18 * S : 0; ctx.shadowColor = 'rgba(0,0,0,.18)';
    ctx.fillStyle = pastelOf(b.sp.color);
    ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, b.side === 'r' ? [R, r, R, R] : [r, R, R, R]); ctx.fill();
    ctx.shadowBlur = 0;
    y += padY;
    for (const l of ls) drawLine(l, bx + padX, '#2c2a2e');
    y += padY;
    ctx.shadowBlur = sh; ctx.shadowColor = 'rgba(0,0,0,.28)';
  });
  ctx.font = small;
  ctx.globalAlpha = 0.75;
  // HUD는 출처를 왼쪽에 흐린 색으로
  if (hud) { ctx.fillStyle = HUD.sub; ctx.globalAlpha = 1; }
  ctx.textAlign = hud ? 'left' : 'right';
  ctx.fillText(source, hud ? textX : textX + textW, y + st.size * 1.2);
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.shadowBlur = 0;
}

export function ExcerptCard({ paras: plain, source, fileName, title = '' }: { paras: string[]; source: string; fileName: string; title?: string }) {
  // 문단마다 글 조각 — 처음엔 꾸밈 없이 한 조각
  const [paras, setParas] = useState<Run[][]>(() => plain.map(t => [{ t }]));
  const markBox = useRef<HTMLDivElement>(null);
  /** 드래그한 범위 → (문단, 글자 위치) — 문단 시작부터의 글자 수로 센다 */
  const selRange = () => {
    const sel = window.getSelection();
    const box = markBox.current;
    if (!sel || sel.isCollapsed || !box || !sel.rangeCount) return null;
    const rg = sel.getRangeAt(0);
    const pOf = (n: Node) => (n.nodeType === 1 ? n as HTMLElement : n.parentElement)?.closest<HTMLElement>('[data-p]');
    const sp = pOf(rg.startContainer), ep = pOf(rg.endContainer);
    if (!sp || !ep || !box.contains(sp) || !box.contains(ep)) return null;
    const off = (p: HTMLElement, node: Node, o: number) => { const r = document.createRange(); r.setStart(p, 0); r.setEnd(node, o); return r.toString().length; };
    return { sp: Number(sp.dataset.p), so: off(sp, rg.startContainer, rg.startOffset), ep: Number(ep.dataset.p), eo: off(ep, rg.endContainer, rg.endOffset) };
  };
  const applyMark = (m: Mark) => {
    const r = selRange();
    if (!r) { toast('꾸밀 부분을 아래 글에서 드래그해 주세요'); return; }
    setParas(ps => ps.map((runs, i) => {
      if (i < r.sp || i > r.ep) return runs;
      const len = runs.reduce((n, x) => n + x.t.length, 0);
      const from = i === r.sp ? r.so : 0, to = i === r.ep ? r.eo : len;
      return to > from ? toggleMark(runs, from, to, m) : runs;
    }));
  };
  const toast = useToast();
  const { fonts, familyOf } = useFonts();
  const [st, setSt] = useState<CardStyle>(DEF);
  // 대사 말풍선 — 문단 번호 → 발화자·붙는 쪽 (사용자 요청)
  const [talk, setTalk] = useState<(Talk | undefined)[]>([]);
  const [spEdit, setSpEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const avRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSt(loadStyle()); setReady(true); }, []);
  const set = (p: Partial<CardStyle>) => setSt(s => { const n = { ...s, ...p }; saveStyle(n); return n; });
  const speakers = st.speakers ?? DEFAULT_SPEAKERS;
  const setSpeakers = (sp: Speaker[]) => set({ speakers: sp });

  const family = typeof window === 'undefined' ? '' : canvasFamily(st.fontId ? familyOf(st.fontId) : undefined);
  useEffect(() => {
    if (!ready || !ref.current) return;
    let alive = true;
    const c = document.createElement('canvas');
    void draw(c, paras, source, st, family, 1, talk, title).then(() => {
      // 다 그린 다음에 한 번에 옮긴다 — 그리는 도중의 빈 화면이 깜빡이지 않게
      const v = ref.current;
      if (!alive || !v) return;
      v.width = c.width; v.height = c.height;
      v.getContext('2d')!.drawImage(c, 0, 0);
    });
    return () => { alive = false; };
  }, [ready, paras, source, st, family, talk, title]);

  const tw = { ...TW_DEF, ...st.tw };
  const setTw = (p: Partial<TweetConf>) => set({ tw: { ...tw, ...p } });
  const isTweet = st.kind === 'tweet', isHud = st.deco === 'hud';
  /** 배경 고르기 — HUD는 어두우니 글씨를 밝게, 다른 배경으로 돌아가면 다시 어둡게 */
  const pickBg = (p: Partial<CardStyle>) => set({ deco: null, ...(isHud && st.color === HUD_INK ? { color: DEF.color } : {}), ...p });
  const upload = async (f?: File, to: 'img' | 'photo' | 'av' = 'img') => {
    if (!f) return;
    try {
      // 메타데이터 없이, 긴 변 2160px까지만 — 고화질 저장(2배)에 맞춘 크기. 이 브라우저 안에만 둔다 (서버에 올리지 않음)
      const clean = await stripImageMeta(f);
      const url = URL.createObjectURL(clean);
      const im = await loadImg(url);
      const k = Math.min(1, (to === 'av' ? 512 : 2160) / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const cx = c.getContext('2d')!;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); imgCache.delete(url);
      const url2 = c.toDataURL('image/jpeg', 0.92);
      if (to === 'av') setTw({ av: url2 });
      else set(to === 'img' ? { img: url2, deco: null } : { photo: url2 });
    } catch (e) {
      toast(`이미지를 넣지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      await draw(c, paras, source, st, family, 2, talk, title);
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
        {/* 모양 — 카드 / 트위터식 (사용자 요청) */}
        <div className="exc-row">
          <label>모양</label>
          <div className="mini-seg">
            <button type="button" className={!isTweet ? 'on' : ''} onClick={() => set({ kind: 'card' })}>카드</button>
            <button type="button" className={isTweet ? 'on' : ''} onClick={() => set({ kind: 'tweet' })}>트윗</button>
          </div>
        </div>
        {/* 문장 꾸미기 — 아래 글에서 드래그한 뒤 버튼 (다시 누르면 꺼짐) */}
        <div className="exc-mark">
          <div className="exc-mark-bar">
            <span>문장 꾸미기</span>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyMark('b')} data-tip="굵게"><b>B</b></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyMark('i')} data-tip="기울임"><i>I</i></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyMark('h')} data-tip="형광펜">
              <span className="exc-hl" style={{ background: st.hl }}>형광펜</span>
            </button>
            <ColorField value={st.hl} onChange={hl => set({ hl })} />
            <button type="button" className="ghost" onMouseDown={e => e.preventDefault()}
              onClick={() => setParas(plain.map(t => [{ t }]))} data-tip="꾸밈 모두 지우기">지우기</button>
          </div>
          <div className="exc-mark-text" ref={markBox}>
            {paras.map((runs, i) => (
              <p key={i} data-p={i}>
                {runs.map((r, k) => (
                  <span key={k} style={{ fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? 'italic' : undefined,
                    background: r.h ? `linear-gradient(transparent 45%, ${st.hl}aa 45%)` : undefined }}>{r.t}</span>
                ))}
              </p>
            ))}
          </div>
          <small>꾸밀 부분을 드래그하고 버튼을 눌러요 — 다시 누르면 꺼져요</small>
        </div>
        {/* 대사 말풍선 (사용자 요청) — 앞뒤가 따옴표인 문단마다 발화자와 붙는 쪽을 고른다 */}
        {isTweet && (
          <div className="exc-tw">
            <div className="exc-row">
              <label>아이디</label>
              <span className="exc-at">@<input className="k-input" value={tw.handle} maxLength={30} placeholder="아이디"
                onChange={e => setTw({ handle: e.target.value.replace(/^@+/, '') })} /></span>
            </div>
            <div className="exc-row">
              <label>시간</label>
              <input className="k-input exc-time" value={tw.time} maxLength={30} placeholder="2시"
                onChange={e => setTw({ time: e.target.value })} />
            </div>
            <div className="exc-row">
              <label>숫자</label>
              <div className="exc-nums">
                {['답글', '리트윗', '마음', '조회수'].map((l, i) => (
                  <input key={l} className="k-input" value={tw.n[i] ?? ''} maxLength={8} placeholder={l} aria-label={l}
                    onChange={e => { const n = [...tw.n]; n[i] = e.target.value; setTw({ n }); }} />
                ))}
              </div>
            </div>
            <div className="exc-row">
              <label>프로필</label>
              {!tw.av && <ColorField value={tw.avColor} onChange={avColor => setTw({ avColor })} />}
              <button type="button" className={`exc-sw exc-up exc-av ${tw.av ? 'on' : ''}`}
                style={tw.av ? { backgroundImage: `url(${tw.av})` } : undefined}
                onClick={() => avRef.current?.click()} data-tip={tw.av ? '사진 바꾸기' : '사진 올리기'}>{tw.av ? '' : '＋'}</button>
              {tw.av && <button type="button" className="ghost exc-txtbtn" onClick={() => setTw({ av: null })}>사진 빼기</button>}
              <input ref={avRef} type="file" accept="image/*" style={{ display: 'none' }} data-crop="1:1"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f, 'av'); }} />
            </div>
            <div className="exc-row">
              <label>색</label>
              <div className="mini-seg">
                <button type="button" className={!tw.dark ? 'on' : ''} onClick={() => setTw({ dark: false })}>밝게</button>
                <button type="button" className={tw.dark ? 'on' : ''} onClick={() => setTw({ dark: true })}>어둡게</button>
              </div>
            </div>
          </div>
        )}
        {!isTweet && paras.some(r => isQuote(r.map(x => x.t).join(''))) && (
          <div className="exc-talk">
            <div className="exc-talk-h">
              <span>대사 · 발화자</span>
              <button type="button" className="ghost" onClick={() => setSpEdit(v => !v)}>{spEdit ? '닫기' : '발화자 편집'}</button>
            </div>
            {spEdit && (
              <div className="exc-sp-edit">
                {speakers.map((sp, k) => (
                  <div key={sp.id} className="exc-sp-row">
                    <ColorField value={sp.color} onChange={color => setSpeakers(speakers.map((x, j) => (j === k ? { ...x, color } : x)))} />
                    <input className="k-input" value={sp.name} maxLength={10}
                      onChange={e => setSpeakers(speakers.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="ghost" aria-label="빼기" onClick={() => setSpeakers(speakers.filter((_, j) => j !== k))}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ghost" onClick={() => setSpeakers([...speakers, { id: `sp${Date.now().toString(36)}`, name: '새 발화자', color: '#c08a4a' }])}>＋ 발화자 추가</button>
                  <button type="button" className="ghost" onClick={() => setSpeakers(DEFAULT_SPEAKERS)}>기본으로</button>
                </div>
              </div>
            )}
            {paras.map((runs, i) => {
              const text = runs.map(x => x.t).join('');
              if (!isQuote(text)) return null;
              const t = talk[i] ?? { who: null, side: 'l' as const };
              const put = (p: Partial<Talk>) => setTalk(ts => { const n = [...ts]; n[i] = { ...t, ...p }; return n; });
              return (
                <div key={i} className="exc-q">
                  <div className="exc-q-t">{text.length > 60 ? `${text.slice(0, 60)}…` : text}</div>
                  <div className="exc-q-c">
                    {speakers.map(sp => (
                      <button key={sp.id} type="button" className={`exc-chip ${t.who === sp.id ? 'on' : ''}`}
                        style={{ ['--c' as string]: pastelOf(sp.color), ['--d' as string]: nameInkOf(sp.color) }}
                        onClick={() => put({ who: sp.id })}><i />{sp.name}</button>
                    ))}
                    <button type="button" className={`exc-chip ${!t.who ? 'on none' : ''}`} onClick={() => put({ who: null })}>없음</button>
                    <span className="exc-side">
                      <button type="button" className={t.side === 'l' ? 'on' : ''} onClick={() => put({ side: 'l' })}>왼쪽</button>
                      <button type="button" className={t.side === 'r' ? 'on' : ''} onClick={() => put({ side: 'r' })}>오른쪽</button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isTweet && (<>
        <div className="exc-row">
          <label>배경</label>
          <div className="exc-bgs">
            <button type="button" className={`exc-sw ${!st.img && !isHud ? 'on' : ''}`} style={{ background: st.bg }}
              onClick={() => pickBg({ img: null })} data-tip="색 배경" />
            {/* 거리측정 HUD (사용자 요청) */}
            <button type="button" className={`exc-sw exc-hud ${isHud ? 'on' : ''}`} data-tip="거리측정 HUD"
              onClick={() => set({ deco: 'hud', img: null, color: HUD_INK })}><i /><i /><i /><i /></button>
            {EXCERPT_BGS.map(b => (
              <button key={b.src} type="button" className={`exc-sw ${st.img === b.src && !isHud ? 'on' : ''}`}
                style={{ backgroundImage: `url(${b.thumb})` }} onClick={() => pickBg({ img: b.src })} />
            ))}
            <button type="button" className={`exc-sw exc-up ${isUp && !isHud ? 'on' : ''}`}
              style={isUp ? { backgroundImage: `url(${st.img})` } : undefined}
              onClick={() => fileRef.current?.click()} data-tip="내 이미지 올리기">{isUp ? '' : '＋'}</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f); }} />
          </div>
        </div>
        {isHud ? (
          <div className="exc-row">
            <label>글씨</label>
            <div className="exc-hudtx">
              {['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'].map((l, i) => (
                <input key={l} className="k-input" value={(st.hud ?? HUD_DEF)[i] ?? ''} maxLength={20} placeholder={`${l} (비우면 숨김)`}
                  onChange={e => { const h = [...(st.hud ?? HUD_DEF)]; h[i] = e.target.value; set({ hud: h }); }} />
              ))}
            </div>
          </div>
        ) : st.img ? (
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
        {/* 사진 따로 넣기 — 가로 띠(글 위) / 세로 띠(글 왼쪽), 비율 2.5:1 */}
        {!isHud && <div className="exc-row">
          <label>사진</label>
          <div className="mini-seg">
            {([['none', '없음'], ['h', '▭ 가로 띠'], ['v', '▯ 세로 띠']] as const).map(([v, l]) => (
              <button key={v} type="button" className={(st.photoDir ?? 'none') === v ? 'on' : ''}
                onClick={() => { set({ photoDir: v }); if (v !== 'none' && !st.photo) setTimeout(() => photoRef.current?.click(), 0); }}>{l}</button>
            ))}
          </div>
          {st.photoDir && st.photoDir !== 'none' && (
            <button type="button" className={`exc-sw exc-up exc-photo ${st.photo ? 'on' : ''} ${st.photoDir}`}
              style={st.photo ? { backgroundImage: `url(${st.photo})` } : undefined}
              onClick={() => photoRef.current?.click()} data-tip={st.photo ? '사진 바꾸기' : '사진 올리기'}>{st.photo ? '' : '＋'}</button>
          )}
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }}
            data-crop={st.photoDir === 'v' ? '2:5' : '5:2'}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f, 'photo'); }} />
        </div>}
        </>)}
        <div className="exc-row">
          <label>글씨체</label>
          <KSelect minWidth={170} value={st.fontId} onChange={fontId => set({ fontId })}
            options={[{ value: '', label: '기본' },
              ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))]} />
        </div>
        {!isTweet && <div className="exc-row">
          <label>글씨색</label><ColorField value={st.color} onChange={color => set({ color })} />
          <span className="exc-quick">
            <button type="button" style={{ background: '#ffffff' }} onClick={() => set({ color: '#ffffff' })} data-tip="흰색" />
            <button type="button" style={{ background: '#2c3037' }} onClick={() => set({ color: '#2c3037' })} data-tip="검정" />
          </span>
        </div>}
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
