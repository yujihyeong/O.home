'use client';
// 지뢰찾기 위젯 (사용자 요청) — 도트 그림 · 게임기 모양 · 낮/밤에 어울리게.
// 화면(LCD)에서 칸을 눌러 열고, 길게 누르기·우클릭(또는 B 버튼으로 깃발 모드)으로 깃발.
// START = 새 게임, SELECT = 난이도 바꾸기. 첫 칸은 늘 안전하다(첫 클릭 뒤에 지뢰를 깐다).
// 최고 기록은 이 브라우저에만 기억한다.
import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ---------- 도트 그림 ---------- */
// 글자 하나 = 픽셀 하나. '.'는 비움, 나머지는 팔레트 색
type Pal = Record<string, string>;
function Pix({ rows, pal, className }: { rows: string[]; pal: Pal; className?: string }) {
  const h = rows.length, w = rows[0].length;
  const rects: React.ReactNode[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c !== '.' && pal[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={pal[c]} />);
  }));
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>{rects}</svg>
  );
}

const FLAG = [
  '..KRR...',
  '..KRRRR.',
  '..KRRRRR',
  '..KRRR..',
  '..K.....',
  '..K.....',
  '.KKKK...',
  '........',
];
const MINE = [
  '....S.S.',
  '...K.S..',
  '..KKKK..',
  '.KWKKKK.',
  '.KWKKKK.',
  '.KKKKKK.',
  '..KKKK..',
  '........',
];
const FACE_OK = [
  '..YYYY..',
  '.YYYYYY.',
  'YYKYYKYY',
  'YPYYYYPY',
  'YYKYYKYY',
  'YYYKKYYY',
  '.YYYYYY.',
  '..YYYY..',
];
const FACE_WIN = [
  '..YYYY..',
  '.YYYYYY.',
  'KKKKKKKK',
  'YKKYYKKY',
  'YPYYYYPY',
  'YKYYYYKY',
  '.YKKKKY.',
  '..YYYY..',
];
const FACE_LOSE = [
  '..YYYY..',
  '.YYYYYY.',
  'YKYKYKYK',
  'YYKYYKYY',
  'YKYKYKYK',
  'YYYKKYYY',
  '.YYKKYY.',
  '..YYYY..',
];
const HEART = [
  '.RR.RR.',
  'RRRRRRR',
  'RRRRRRR',
  '.RRRRR.',
  '..RRR..',
  '...R...',
];

/* ---------- 판 ---------- */
const LEVELS = [
  { key: 'easy', label: 'EASY', w: 8, h: 8, mines: 10 },
  { key: 'hard', label: 'HARD', w: 10, h: 10, mines: 18 },
] as const;
type Level = (typeof LEVELS)[number];

interface Cell { mine: boolean; open: boolean; flag: boolean; n: number }
type Phase = 'ready' | 'play' | 'win' | 'lose';

const blank = (lv: Level): Cell[] =>
  Array.from({ length: lv.w * lv.h }, () => ({ mine: false, open: false, flag: false, n: 0 }));

const around = (lv: Level, i: number): number[] => {
  const x = i % lv.w, y = Math.floor(i / lv.w), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < lv.w && ny < lv.h) out.push(ny * lv.w + nx);
  }
  return out;
};

/** 첫 칸과 그 주변을 비워 두고 지뢰를 깐다 */
function lay(lv: Level, safe: number): Cell[] {
  const cells = blank(lv);
  const keep = new Set([safe, ...around(lv, safe)]);
  const pool = cells.map((_, i) => i).filter(i => !keep.has(i));
  for (let k = 0; k < lv.mines && pool.length; k++) {
    const j = Math.floor(Math.random() * pool.length);
    cells[pool[j]].mine = true;
    pool.splice(j, 1);
  }
  cells.forEach((c, i) => { c.n = around(lv, i).filter(j => cells[j].mine).length; });
  return cells;
}

/** 0칸이면 주변까지 번져 연다 */
function flood(lv: Level, cells: Cell[], start: number) {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const c = cells[i];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.n === 0 && !c.mine) stack.push(...around(lv, i));
  }
}

const pad3 = (n: number) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');
const BEST_KEY = 'ohome.mines.best.v1';

/** 도트 글꼴 — 한 번만 불러온다 */
function useDotFont() {
  useEffect(() => {
    if (document.getElementById('ohome-dotfont')) return;
    const l = document.createElement('link');
    l.id = 'ohome-dotfont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
    document.head.appendChild(l);
  }, []);
}

export function MinesWidget() {
  useDotFont();
  const [lvIdx, setLvIdx] = useState(0);
  const lv = LEVELS[lvIdx];
  const [cells, setCells] = useState<Cell[]>(() => blank(lv));
  const [phase, setPhase] = useState<Phase>('ready');
  const [flagMode, setFlagMode] = useState(false);
  const [time, setTime] = useState(0);
  const [boom, setBoom] = useState(-1);
  const [best, setBest] = useState<Record<string, number>>({});
  const press = useRef<{ t: number; i: number; fired: boolean } | null>(null);

  useEffect(() => {
    try { setBest(JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>); } catch { /* 무시 */ }
  }, []);

  // 시계 — 첫 칸을 연 뒤부터 끝날 때까지
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => setTime(s => Math.min(999, s + 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const reset = useCallback((idx = lvIdx) => {
    setCells(blank(LEVELS[idx])); setPhase('ready'); setTime(0); setBoom(-1); setFlagMode(false);
  }, [lvIdx]);

  const nextLevel = () => { const n = (lvIdx + 1) % LEVELS.length; setLvIdx(n); reset(n); };

  const finishIfWon = (next: Cell[]) => {
    if (next.every(c => c.mine || c.open)) {
      setPhase('win');
      next.forEach(c => { if (c.mine) c.flag = true; });
      setBest(b => {
        if (b[lv.key] != null && b[lv.key] <= time) return b;
        const nb = { ...b, [lv.key]: time };
        try { localStorage.setItem(BEST_KEY, JSON.stringify(nb)); } catch { /* 무시 */ }
        return nb;
      });
    }
  };

  const open = (i: number) => {
    if (phase === 'win' || phase === 'lose') return;
    let next = cells.map(c => ({ ...c }));
    if (phase === 'ready') { next = lay(lv, i); setPhase('play'); }
    const c = next[i];
    if (c.flag) return;
    if (c.open) {
      // 숫자 칸을 다시 누르면 — 둘레 깃발 수가 맞을 때 나머지를 한 번에 연다
      const ar = around(lv, i);
      if (c.n && ar.filter(j => next[j].flag).length === c.n) {
        const hit = ar.find(j => !next[j].flag && next[j].mine);
        if (hit != null) return lose(next, hit);
        ar.forEach(j => flood(lv, next, j));
        setCells(next); finishIfWon(next);
      }
      return;
    }
    if (c.mine) return lose(next, i);
    flood(lv, next, i);
    setCells(next); finishIfWon(next);
  };

  const lose = (next: Cell[], hit: number) => {
    next.forEach(c => { if (c.mine) c.open = true; });
    setBoom(hit); setCells(next); setPhase('lose');
  };

  const flag = (i: number) => {
    if (phase !== 'play' && phase !== 'ready') return;
    if (cells[i].open) return;
    setCells(cs => cs.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c)));
  };

  // 길게 누르면 깃발 (휴대폰)
  const down = (i: number) => {
    press.current = { t: window.setTimeout(() => { if (press.current) { press.current.fired = true; flag(i); } }, 380), i, fired: false };
  };
  const up = (i: number) => {
    const p = press.current; press.current = null;
    if (!p) return;
    clearTimeout(p.t);
    if (p.fired || p.i !== i) return;
    if (flagMode) flag(i); else open(i);
  };
  const cancel = () => { if (press.current) { clearTimeout(press.current.t); press.current = null; } };

  const left = lv.mines - cells.filter(c => c.flag).length;
  const face = phase === 'win' ? FACE_WIN : phase === 'lose' ? FACE_LOSE : FACE_OK;

  return (
    <div className="gbx" onClick={e => e.stopPropagation()}>
      <div className="gbx-top">
        <span className="gbx-led" data-on={phase === 'play' ? '1' : undefined} />
        <span className="gbx-brand">DOT MINES</span>
        <span className="gbx-hearts"><Pix rows={HEART} pal={{ R: 'var(--gb-heart)' }} className="gbx-heart" /></span>
      </div>

      <div className="gbx-bezel">
        <div className="gbx-hud">
          <span className="gbx-num" data-tip="남은 지뢰"><Pix rows={MINE} pal={{ K: 'currentColor', W: 'var(--gb-lcd)', S: 'var(--gb-spark)' }} className="gbx-ico" />{pad3(left)}</span>
          <button type="button" className="gbx-face" onClick={() => reset()} aria-label="새 게임">
            <Pix rows={face} pal={{ Y: 'var(--gb-face)', K: 'var(--gb-face-ink)', P: 'var(--gb-cheek)' }} />
          </button>
          <span className="gbx-num">⏱{pad3(time)}</span>
        </div>
        <div className={`gbx-lcd ${flagMode ? 'flag-mode' : ''}`}
          style={{ gridTemplateColumns: `repeat(${lv.w}, 1fr)` }}
          onContextMenu={e => e.preventDefault()}>
          {cells.map((c, i) => (
            <button key={i} type="button"
              className={`gbx-cell ${c.open ? 'open' : ''} ${i === boom ? 'boom' : ''} ${c.open && c.n && !c.mine ? `n${c.n}` : ''}`}
              onPointerDown={e => { if (e.button === 0) down(i); }}
              onPointerUp={e => { if (e.button === 0) up(i); }}
              onPointerLeave={cancel}
              onContextMenu={e => { e.preventDefault(); cancel(); flag(i); }}
              aria-label={c.open ? (c.mine ? '지뢰' : String(c.n || '빈 칸')) : c.flag ? '깃발' : '닫힌 칸'}>
              {c.open
                ? (c.mine
                  ? <Pix rows={MINE} pal={{ K: 'var(--gb-mine)', W: '#ffffff', S: 'var(--gb-spark)' }} />
                  : (c.n ? c.n : ''))
                : c.flag ? <Pix rows={FLAG} pal={{ K: 'var(--gb-pole)', R: 'var(--gb-flag)' }} /> : ''}
            </button>
          ))}
          {(phase === 'win' || phase === 'lose') && (
            <div className="gbx-msg" onClick={() => reset()}>
              <b>{phase === 'win' ? 'CLEAR!' : 'BOOM!'}</b>
              <small>{phase === 'win' ? `TIME ${pad3(time)}` : 'TRY AGAIN?'}</small>
              <small className="gbx-press">PRESS START</small>
            </div>
          )}
        </div>
        <div className="gbx-foot">
          <span>{lv.label}</span>
          <span>BEST {best[lv.key] != null ? pad3(best[lv.key]) : '---'}</span>
        </div>
      </div>

      <div className="gbx-ctrl">
        <div className="gbx-dpad" aria-hidden><i /><i /></div>
        <div className="gbx-ab">
          {/* 글자는 버튼 아래에 작게 — 진짜 게임기처럼 */}
          <span className="gbx-abw b">
            <button type="button" className={`gbx-btn ${flagMode ? 'on' : ''}`} onClick={() => setFlagMode(v => !v)}
              data-tip="깃발 모드 — 켜면 누르는 칸에 깃발" aria-label="B — 깃발 모드" />
            <small>B</small>
          </span>
          <span className="gbx-abw a">
            <button type="button" className="gbx-btn" onClick={() => setFlagMode(false)} data-tip="여는 모드" aria-label="A — 여는 모드" />
            <small>A</small>
          </span>
        </div>
      </div>
      <div className="gbx-sys">
        <button type="button" onClick={nextLevel}><i />SELECT</button>
        <button type="button" onClick={() => reset()}><i />START</button>
      </div>
      <div className="gbx-hint">{flagMode ? '🚩 깃발 모드' : '누르면 열기 · 길게/우클릭은 깃발'}</div>
    </div>
  );
}
