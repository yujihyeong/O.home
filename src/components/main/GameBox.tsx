'use client';
// 게임기 (사용자 요청 — 지뢰찾기 칸을 게임 칸으로) — 처음엔 게임 종류를 고르고, 고르면 그 게임의 난이도 화면으로.
// 한 번 연 게임은 판을 그대로 두어(숨김만) 다른 게임을 갔다 와도 이어서 할 수 있다.
import React, { useState } from 'react';
import { MinesWidget, Pix, HEART, MINE, FACE_OK, useDotFont } from './MinesWidget';
import { SudokuWidget } from './SudokuWidget';
import { WordChainWidget } from './WordChainWidget';

type Game = 'mines' | 'sudoku' | 'words';
const SDK_ICON = [
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
  'K.K.K.K',
  'KKKKKKK',
];
const WORD_ICON = [
  'KKK.KKK',
  'K.K.K.K',
  'KKK.KKK',
  '..KKK..',
  'KKK.KKK',
  'K.K.K.K',
  'KKK.KKK',
];
const GAMES: { key: Game; label: string; sub: string; icon: string[] }[] = [
  { key: 'mines', label: 'MINES', sub: '지뢰찾기', icon: MINE },
  { key: 'sudoku', label: 'SUDOKU', sub: '스도쿠', icon: SDK_ICON },
  { key: 'words', label: 'WORD CHAIN', sub: '끝말잇기', icon: WORD_ICON },
];

export function GameBox() {
  useDotFont();
  const [game, setGame] = useState<Game | null>(null);
  const [seen, setSeen] = useState<Game[]>([]);
  const [last, setLast] = useState<Game>('mines');
  const go = (g: Game) => { setGame(g); setLast(g); setSeen(s => (s.includes(g) ? s : [...s, g])); };
  const home = () => setGame(null);

  return (
    <>
      {seen.includes('mines') && <div hidden={game !== 'mines'}><MinesWidget onHome={home} /></div>}
      {seen.includes('sudoku') && <div hidden={game !== 'sudoku'}><SudokuWidget onHome={home} /></div>}
      {seen.includes('words') && <div hidden={game !== 'words'}><WordChainWidget onHome={home} /></div>}
      {game === null && (
        <div className="gbx" onClick={e => e.stopPropagation()} style={{ '--gbx-w': '264px' } as React.CSSProperties}>
          <div className="gbx-top">
            <span className="gbx-led" />
            <span className="gbx-brand">DOT GAMES</span>
            <span className="gbx-hearts"><Pix rows={HEART} pal={{ R: 'var(--gb-heart)' }} className="gbx-heart" /></span>
          </div>
          <div className="gbx-bezel">
            <div className="gbx-hud gbx-hud-c">
              <span className="gbx-face" aria-hidden>
                <Pix rows={FACE_OK} pal={{ Y: 'var(--gb-face)', K: 'var(--gb-face-ink)', P: 'var(--gb-cheek)', W: '#ffffff' }} />
              </span>
            </div>
            <div className="gbx-lcd gbx-menu">
              <b>SELECT GAME</b>
              {GAMES.map(g => (
                <button key={g.key} type="button" className={`gbx-lv gbx-game ${g.key === last ? 'on' : ''}`} onClick={() => go(g.key)}>
                  <Pix rows={g.icon} pal={{ K: 'currentColor', W: 'var(--gb-tile)', S: 'var(--gb-spark)' }} className="gbx-game-ico" />
                  <span className="gbx-lv-name">{g.label}</span>
                  <small>{g.sub}{seen.includes(g.key) ? ' · 이어서 하기' : ''}</small>
                </button>
              ))}
            </div>
            <div className="gbx-foot"><span>CHOOSE ONE</span><span>{GAMES.length} GAMES</span></div>
          </div>
          <div className="gbx-ctrl">
            <svg className="gbx-dpad" viewBox="0 0 52 54" aria-hidden>
              <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad-lo)" transform="translate(0 2)" />
              <path d="M17 2h18v15h15v18H35v15H17V35H2V17h15z" fill="var(--gb-dpad)" />
            </svg>
            <div className="gbx-ab">
              <span className="gbx-abw b"><button type="button" className="gbx-btn" aria-label="B" /><small>B</small></span>
              <span className="gbx-abw a"><button type="button" className="gbx-btn" onClick={() => go(last)} aria-label="A — 시작" /><small>A</small></span>
            </div>
          </div>
          <div className="gbx-sys">
            <button type="button" onClick={() => setLast(l => GAMES[(GAMES.findIndex(g => g.key === l) + 1) % GAMES.length].key)}><i />SELECT</button>
            <button type="button" onClick={() => go(last)}><i />START</button>
          </div>
        </div>
      )}
    </>
  );
}
