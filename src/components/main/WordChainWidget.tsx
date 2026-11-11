'use client';
// 끝말잇기 (사용자 요청) — 컴퓨터와 번갈아 낱말을 잇는다. 50번 주고받으면 승리, 내 차례 제한시간 5초.
// 컴퓨터가 먼저 낱말을 내고, 끝 글자로 시작하는 낱말(두음법칙 인정)을 5초 안에 넣는다.
// 틀린 낱말은 넘어가지 않고 시간만 흐른다. START = 새 게임, SELECT = 시작 화면(한 번 더 = 게임 고르기).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadWords, pickWord, checkWord, followers, startsFor, type WordBook, type Check } from '@/lib/wordchain';
import { Pix, HEART, FACE_OK, FACE_WIN, FACE_LOSE, pad3, useDotFont } from './MinesWidget';

const GOAL = 50;        // 이만큼 주고받으면 승리
const LIMIT = 5000;     // 내 차례 제한시간(ms)
const BEST_KEY = 'ohome.wordchain.best.v1';

type Phase = 'menu' | 'loading' | 'mine' | 'cpu' | 'win' | 'lose';

const WHY: Record<Exclude<Check, 'ok'>, string> = {
  short: '한글 두 글자 이상으로 써 주세요',
  start: '끝 글자로 시작해야 해요',
  used: '이미 나온 낱말이에요',
  unknown: '사전에 없는 낱말이에요',
  dead: '이을 말이 없는 낱말은 안 돼요',
};

export function WordChainWidget({ onHome }: { onHome?: () => void }) {
  useDotFont();
  const [phase, setPhase] = useState<Phase>('menu');
  const [chain, setChain] = useState<{ w: string; me: boolean }[]>([]);
  const [count, setCount] = useState(0);
  const [leftMs, setLeftMs] = useState(LIMIT);
  const [turn, setTurn] = useState(0);            // 내 차례가 올 때마다 +1 — 시간 막대를 새로 돌린다
  const [msg, setMsg] = useState('');
  const [hint, setHint] = useState('');           // 졌을 때 보여 주는 「이런 말이 있었어요」
  const [best, setBest] = useState(0);
  const book = useRef<WordBook | null>(null);
  const used = useRef(new Set<string>());
  const deadline = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const cpuTimer = useRef(0);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(BEST_KEY)) || 0); } catch { /* 무시 */ }
    return () => clearTimeout(cpuTimer.current);
  }, []);

  const current = chain.length ? chain[chain.length - 1].w : '';

  const saveBest = (n: number) => setBest(b => {
    if (n <= b) return b;
    try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* 무시 */ }
    return n;
  });

  const myTurn = useCallback(() => {
    deadline.current = Date.now() + LIMIT;
    setLeftMs(LIMIT); setTurn(t => t + 1); setPhase('mine');
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }, []);

  const start = async () => {
    clearTimeout(cpuTimer.current);
    setMsg(''); setHint(''); setCount(0); setChain([]);
    used.current = new Set();
    if (!book.current) {
      setPhase('loading');
      try { book.current = await loadWords(); }
      catch { setPhase('menu'); setMsg('낱말을 불러오지 못했어요 — 다시 눌러 주세요'); return; }
    }
    const first = pickWord(book.current, null, used.current)!;
    used.current.add(first);
    setChain([{ w: first, me: false }]);
    myTurn();
  };

  const toMenu = () => { clearTimeout(cpuTimer.current); setPhase('menu'); setMsg(''); };

  // 시계 — 내 차례에만 흐른다. 0이 되면 진다
  useEffect(() => {
    if (phase !== 'mine') return;
    const t = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left > 0) { setLeftMs(left); return; }
      clearInterval(t);
      setLeftMs(0); setPhase('lose'); setMsg('');
      const b = book.current;
      if (b && current) setHint(followers(b, current, used.current).find(w => w.length <= 3) ?? '');
      input.current?.blur();
    }, 100);
    return () => clearInterval(t);
  }, [phase, turn, current]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const b = book.current, el = input.current;
    if (phase !== 'mine' || !b || !el) return;
    const w = el.value.trim();
    if (!w) return;
    const res = checkWord(b, current, w, used.current);
    if (res !== 'ok') { setMsg(WHY[res]); el.select(); return; }
    el.value = ''; setMsg('');
    used.current.add(w);
    const n = count + 1;
    setCount(n); saveBest(n);
    setChain(c => [...c, { w, me: true }]);
    if (n >= GOAL) { setPhase('win'); el.blur(); return; }
    setPhase('cpu');
    cpuTimer.current = window.setTimeout(() => {
      const ans = pickWord(b, w, used.current);
      if (!ans) { setPhase('win'); setMsg('컴퓨터가 낱말을 못 찾았어요'); return; }
      used.current.add(ans);
      setChain(c => [...c, { w: ans, me: false }]);
      myTurn();
    }, 650);
  };

  const playing = phase === 'mine' || phase === 'cpu';
  const over = phase === 'win' || phase === 'lose';
  const starts = current ? startsFor(current[current.length - 1]) : [];
  const face = phase === 'win' ? FACE_WIN : phase === 'lose' ? FACE_LOSE : FACE_OK;
  const prev = chain.slice(-3, -1);

  return (
    <div className="gbx" data-wide={phase === 'menu' || phase === 'loading' ? undefined : ''} onClick={e => e.stopPropagation()}
      style={{ '--gbx-w': `${phase === 'menu' || phase === 'loading' ? 264 : 304}px` } as React.CSSProperties}>
      <div className="gbx-top">
        <span className="gbx-led" data-on={playing ? '1' : undefined} />
        <span className="gbx-brand">DOT WORDS</span>
        <span className="gbx-hearts"><Pix rows={HEART} pal={{ R: 'var(--gb-heart)' }} className="gbx-heart" /></span>
      </div>

      <div className="gbx-bezel">
        <div className="gbx-hud">
          <span className="gbx-num" data-tip="주고받은 횟수">{String(count).padStart(2, '0')}/{GOAL}</span>
          <button type="button" className="gbx-face" onClick={start} aria-label="새 게임">
            <Pix rows={face} pal={{ Y: 'var(--gb-face)', K: 'var(--gb-face-ink)', P: 'var(--gb-cheek)', W: '#ffffff' }} />
          </button>
          <span className="gbx-num">⏱{(Math.ceil(leftMs / 100) / 10).toFixed(1)}</span>
        </div>

        {phase === 'menu' || phase === 'loading' ? (
          <div className="gbx-lcd gbx-menu">
            <b>WORD CHAIN</b>
            <div className="wc-rules">
              <span>컴퓨터와 번갈아 끝말을 이어요</span>
              <span><b>{GOAL}번</b> 주고받으면 승리</span>
              <span>제한시간 <b>{LIMIT / 1000}초</b></span>
            </div>
            <button type="button" className="gbx-lv wc-start on" onClick={start} disabled={phase === 'loading'}>
              <span className="gbx-lv-name">{phase === 'loading' ? 'LOADING…' : 'START'}</span>
            </button>
            {msg && <small className="wc-msg">{msg}</small>}
            {onHome && <button type="button" className="gbx-back" onClick={onHome}>◀ GAMES</button>}
          </div>
        ) : (
          <div className="gbx-lcd wc">
            <div className="wc-prev">
              {prev.map((c, i) => <span key={`${c.w}-${i}`} className={c.me ? 'me' : ''}>{c.w}</span>)}
            </div>
            <div className={`wc-word ${chain[chain.length - 1]?.me ? 'me' : ''}`} key={current}>
              {current.slice(0, -1)}<em>{current.slice(-1)}</em>
            </div>
            <div className="wc-bar" data-run={phase === 'mine' ? '1' : undefined}>
              <i key={turn} style={{ animationDuration: `${LIMIT}ms` }} />
            </div>
            <form className="wc-form" onSubmit={submit}>
              <input ref={input} type="text" lang="ko" inputMode="text" enterKeyHint="send" autoComplete="off" autoCorrect="off"
                autoCapitalize="off" spellCheck={false} maxLength={12} disabled={phase !== 'mine'}
                placeholder={phase === 'cpu' ? '컴퓨터 차례…' : starts.length ? `${starts.join(' · ')}(으)로 시작` : ''}
                aria-label="이을 낱말" />
              <button type="submit" disabled={phase !== 'mine'}>입력</button>
            </form>
            <small className="wc-msg">{msg}</small>
            {over && (
              <div className="gbx-msg" onClick={start}>
                <b>{phase === 'win' ? 'YOU WIN!' : 'TIME UP!'}</b>
                <small>{phase === 'win' ? (msg || `${GOAL}번 성공!`) : `${count}번 이었어요${hint ? ` · 예: ${hint}` : ''}`}</small>
                <small className="gbx-press">PRESS START</small>
              </div>
            )}
          </div>
        )}

        <div className="gbx-foot">
          <span>{playing ? (phase === 'mine' ? 'YOUR TURN' : 'CPU TURN') : 'WORD CHAIN'}</span>
          <span>BEST {best ? pad3(best) : '---'}</span>
        </div>
      </div>

      <div className="gbx-ctrl">
        <svg className="gbx-dpad" viewBox="0 0 52 54" aria-hidden>
          <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad-lo)" transform="translate(0 2)" />
          <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad)" />
        </svg>
        <div className="gbx-ab">
          <span className="gbx-abw b">
            <button type="button" className="gbx-btn" aria-label="B — 지우기" data-tip="지우기"
              onClick={() => { if (input.current) { input.current.value = ''; input.current.focus({ preventScroll: true }); } }} />
            <small>B</small>
          </span>
          <span className="gbx-abw a">
            <button type="button" className="gbx-btn" aria-label="A — 입력" data-tip="입력"
              onClick={() => (phase === 'mine' ? submit() : phase === 'cpu' ? undefined : start())} />
            <small>A</small>
          </span>
        </div>
      </div>
      <div className="gbx-sys">
        <button type="button" onClick={() => (phase === 'menu' ? onHome?.() : toMenu())}><i />SELECT</button>
        <button type="button" onClick={start}><i />START</button>
      </div>
    </div>
  );
}
