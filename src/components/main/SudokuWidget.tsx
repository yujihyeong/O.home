'use client';
// 스도쿠 (사용자 요청) — 지뢰찾기와 같은 게임기 모양. 처음엔 난이도(EASY·NORMAL·HARD)를 고르고, 고를 때마다 새 문제를 만든다.
// 칸을 누르고 아래 숫자판으로 넣는다. B = 메모 모드(작은 숫자), A = 지우기. 틀린 숫자는 빨갛게.
// SELECT = 난이도 화면(거기서 한 번 더 = 게임 고르기), START = 같은 난이도 새 문제. 최고 기록은 이 브라우저에만.
import React, { useEffect, useMemo, useState } from 'react';
import { makeSudoku, sudokuBox } from '@/lib/sudoku';
import { Pix, HEART, FACE_OK, FACE_WIN, pad3, useDotFont } from './MinesWidget';

const LEVELS = [
  { key: 'easy', label: 'EASY', clues: 40 },
  { key: 'normal', label: 'NORMAL', clues: 32 },
  { key: 'hard', label: 'HARD', clues: 25 },
] as const;
const BEST_KEY = 'ohome.sudoku.best.v1';

type Phase = 'menu' | 'play' | 'win';

const peers = (a: number, b: number) =>
  Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 || sudokuBox(a) === sudokuBox(b);

/** 3×3 미니 격자 아이콘 */
const GRID_ICON = [
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
];

export function SudokuWidget({ onHome }: { onHome?: () => void }) {
  useDotFont();
  const [lvIdx, setLvIdx] = useState(0);
  const lv = LEVELS[lvIdx];
  const [phase, setPhase] = useState<Phase>('menu');
  const [puzzle, setPuzzle] = useState<number[]>(() => new Array(81).fill(0));
  const [solution, setSolution] = useState<number[]>(() => new Array(81).fill(0));
  const [vals, setVals] = useState<number[]>(() => new Array(81).fill(0));
  const [notes, setNotes] = useState<number[]>(() => new Array(81).fill(0));
  const [sel, setSel] = useState(-1);
  const [memo, setMemo] = useState(false);
  const [time, setTime] = useState(0);
  const [miss, setMiss] = useState(0);
  const [best, setBest] = useState<Record<string, number>>({});

  useEffect(() => {
    try { setBest(JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>); } catch { /* 무시 */ }
  }, []);

  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => setTime(s => Math.min(999, s + 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const start = (n = lvIdx) => {
    const { puzzle: p, solution: s } = makeSudoku(LEVELS[n].clues);
    setLvIdx(n); setPuzzle(p); setSolution(s); setVals([...p]); setNotes(new Array(81).fill(0));
    setSel(-1); setMemo(false); setTime(0); setMiss(0); setPhase('play');
  };
  const toMenu = () => { setPhase('menu'); setSel(-1); };

  const put = (d: number) => {
    if (phase !== 'play' || sel < 0 || puzzle[sel]) return;
    if (memo && d) {
      if (vals[sel]) return;
      setNotes(ns => ns.map((m, i) => (i === sel ? m ^ (1 << d) : m)));
      return;
    }
    if (d && vals[sel] === d) return;
    const next = vals.map((v, i) => (i === sel ? d : v));
    setVals(next);
    setNotes(ns => ns.map((m, i) => (i === sel ? 0 : d && peers(i, sel) ? m & ~(1 << d) : m)));
    if (d && d !== solution[sel]) setMiss(m => Math.min(999, m + 1));
    if (next.every((v, i) => v === solution[i])) {
      setPhase('win'); setSel(-1);
      setBest(b => {
        if (b[lv.key] != null && b[lv.key] <= time) return b;
        const nb = { ...b, [lv.key]: time };
        try { localStorage.setItem(BEST_KEY, JSON.stringify(nb)); } catch { /* 무시 */ }
        return nb;
      });
    }
  };

  // 키보드 — 숫자·지우기·화살표 (게임 화면을 누른 뒤)
  const onKey = (e: React.KeyboardEvent) => {
    if (phase !== 'play') return;
    if (/^[1-9]$/.test(e.key)) { put(Number(e.key)); e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { put(0); e.preventDefault(); }
    else if (e.key.startsWith('Arrow')) {
      const s = sel < 0 ? 40 : sel;
      const r = Math.floor(s / 9), c = s % 9;
      const [nr, nc] = e.key === 'ArrowUp' ? [r + 8, c] : e.key === 'ArrowDown' ? [r + 1, c] : e.key === 'ArrowLeft' ? [r, c + 8] : [r, c + 1];
      setSel((nr % 9) * 9 + (nc % 9)); e.preventDefault();
    }
  };

  const done = useMemo(() => {
    const cnt = new Array(10).fill(0);
    vals.forEach((v, i) => { if (v && v === solution[i]) cnt[v]++; });
    return cnt;
  }, [vals, solution]);
  const empty = vals.filter((v, i) => v !== solution[i]).length;
  const selVal = sel >= 0 ? vals[sel] : 0;

  return (
    <div className="gbx" data-wide={phase === 'menu' ? undefined : ''} onClick={e => e.stopPropagation()}
      style={{ '--gbx-w': `${phase === 'menu' ? 264 : 304}px` } as React.CSSProperties}>
      <div className="gbx-top">
        <span className="gbx-led" data-on={phase === 'play' ? '1' : undefined} />
        <span className="gbx-brand">DOT SUDOKU</span>
        <span className="gbx-hearts"><Pix rows={HEART} pal={{ R: 'var(--gb-heart)' }} className="gbx-heart" /></span>
      </div>

      <div className="gbx-bezel">
        <div className="gbx-hud">
          <span className="gbx-num" data-tip="남은 칸"><Pix rows={GRID_ICON} pal={{ K: 'currentColor' }} className="gbx-ico" />{pad3(phase === 'menu' ? 0 : empty)}</span>
          <button type="button" className="gbx-face" onClick={() => start()} aria-label="새 문제">
            <Pix rows={phase === 'win' ? FACE_WIN : FACE_OK} pal={{ Y: 'var(--gb-face)', K: 'var(--gb-face-ink)', P: 'var(--gb-cheek)', W: '#ffffff' }} />
          </button>
          <span className="gbx-num">⏱{pad3(time)}</span>
        </div>

        {phase === 'menu' ? (
          <div className="gbx-lcd gbx-menu">
            <b>SELECT LEVEL</b>
            {LEVELS.map((l, n) => (
              <button key={l.key} type="button" className={`gbx-lv ${n === lvIdx ? 'on' : ''}`} onClick={() => start(n)}>
                <span className="gbx-lv-name">{l.label}</span>
                <small>9×9 · 힌트 {l.clues}</small>
                <small className="gbx-lv-best">{best[l.key] != null ? `BEST ${pad3(best[l.key])}` : ''}</small>
              </button>
            ))}
            {onHome
              ? <button type="button" className="gbx-back" onClick={onHome}>◀ GAMES</button>
              : <small className="gbx-press">PUSH TO START</small>}
          </div>
        ) : (
          <div className={`gbx-lcd sdk ${memo ? 'flag-mode' : ''}`} tabIndex={0} onKeyDown={onKey}>
            <div className="sdk-grid">
              {vals.map((v, i) => {
                const given = !!puzzle[i];
                const wrong = !given && v && v !== solution[i];
                const cls = [
                  'sdk-cell',
                  given ? 'given' : v ? 'mine' : '',
                  wrong ? 'wrong' : '',
                  i === sel ? 'sel' : sel >= 0 && peers(i, sel) ? 'peer' : '',
                  selVal && v === selVal && i !== sel ? 'same' : '',
                  i % 9 === 2 || i % 9 === 5 ? 'br' : '',
                  Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? 'bb' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button key={i} type="button" className={cls} onClick={() => setSel(i)}
                    aria-label={`${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열 ${v || '빈 칸'}`}>
                    {v ? v : notes[i] ? (
                      <span className="sdk-notes">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <i key={d}>{notes[i] & (1 << d) ? d : ''}</i>)}
                      </span>
                    ) : ''}
                  </button>
                );
              })}
            </div>
            {phase === 'win' && (
              <div className="gbx-msg" onClick={() => start()}>
                <b>CLEAR!</b>
                <small>TIME {pad3(time)} · MISS {miss}</small>
                <small className="gbx-press">PRESS START</small>
                <button type="button" className="gbx-msg-lv" onClick={e => { e.stopPropagation(); toMenu(); }}>난이도 바꾸기</button>
              </div>
            )}
          </div>
        )}

        {phase !== 'menu' && (
          <div className="sdk-pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
              <button key={d} type="button" className={done[d] >= 9 ? 'full' : ''} onClick={() => put(d)}>{d}</button>
            ))}
            <button type="button" className="del" onClick={() => put(0)} aria-label="지우기">✕</button>
          </div>
        )}

        <div className="gbx-foot">
          <span>{phase === 'menu' ? 'CHOOSE ONE' : `${lv.label}${memo ? ' · MEMO' : ''}`}</span>
          <span>{phase === 'menu' ? `BEST ${best[lv.key] != null ? pad3(best[lv.key]) : '---'}` : `MISS ${miss}`}</span>
        </div>
      </div>

      <div className="gbx-ctrl">
        <svg className="gbx-dpad" viewBox="0 0 52 54" aria-hidden>
          <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad-lo)" transform="translate(0 2)" />
          <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad)" />
        </svg>
        <div className="gbx-ab">
          <span className="gbx-abw b">
            <button type="button" className={`gbx-btn ${memo ? 'on' : ''}`} onClick={() => setMemo(v => !v)}
              data-tip="메모 모드 — 켜면 작은 숫자로 적어 둔다" aria-label="B — 메모 모드" />
            <small>B</small>
          </span>
          <span className="gbx-abw a">
            <button type="button" className="gbx-btn" onClick={() => put(0)} data-tip="지우기" aria-label="A — 지우기" />
            <small>A</small>
          </span>
        </div>
      </div>
      <div className="gbx-sys">
        <button type="button" onClick={() => (phase === 'menu' ? onHome?.() : toMenu())}><i />SELECT</button>
        <button type="button" onClick={() => start()}><i />START</button>
      </div>
    </div>
  );
}
