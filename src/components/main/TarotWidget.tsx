'use client';
// 오늘의 타로 위젯 (사용자 요청) — 하루 한 번 카드를 뒤집어 짧은 운세 한 문장.
//  · 카드·문장은 서버(/api/fortune)가 방문자 IP + 오늘 날짜로 정한 씨앗으로 고른다 → 같은 사람은 하루 종일 같은 운세
//  · 뒤집었는지는 이 기기에 날짜와 함께 기억 — 다시 와도 뒤집힌 채, 다음 날(한국 시간 0시)이면 새로 뽑기
//  · 낮/밤 테마에 따라 카드 색이 바뀐다 (색은 CSS 변수)
import React, { useEffect, useState } from 'react';
import { ARCANA, FORTUNES, Motif } from '@/lib/fortunes';

const KEY = 'ohome.fortune.v1';
interface Saved { date: string; seed: string; drawn: boolean }

const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const load = (): Saved | null => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null; } catch { return null; }
};
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ } };

/** 서버가 안 될 때(로컬 모드 등) — 이 기기에서 오늘 하루 쓸 씨앗 */
const localSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');

function pick(seed: string) {
  const a = ARCANA[parseInt(seed.slice(0, 6), 16) % ARCANA.length];
  const f = FORTUNES[parseInt(seed.slice(6, 12), 16) % FORTUNES.length];
  return { a, f };
}

/* ---------- 카드 그림 ---------- */
function MotifArt({ m }: { m: Motif }) {
  const g = { fill: 'none', stroke: 'var(--tr-gold)', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const fillG = { fill: 'var(--tr-gold)' };
  switch (m) {
    case 'sun': return (<g>{Array.from({ length: 16 }, (_, i) => { const r = (i * Math.PI) / 8, l = i % 2 ? 19 : 24; return <line key={i} x1={60 + Math.cos(r) * 14} y1={86 + Math.sin(r) * 14} x2={60 + Math.cos(r) * l} y2={86 + Math.sin(r) * l} {...g} />; })}<circle cx="60" cy="86" r="10" {...fillG} /></g>);
    case 'moon': return (<g><path d="M66 66a20 20 0 1 0 0 40a26 26 0 0 1 0-40z" {...fillG} /><circle cx="78" cy="72" r="1.6" {...fillG} /><circle cx="83" cy="88" r="1.1" {...fillG} /></g>);
    case 'star': return (<g><path d="M60 62 L65 81 L84 86 L65 91 L60 110 L55 91 L36 86 L55 81 Z" {...fillG} /><path d="M60 72 L62 84 L74 86 L62 88 L60 100 L58 88 L46 86 L58 84 Z" fill="var(--tr-face)" /></g>);
    case 'heart': return (<g><path d="M60 104 C40 90 38 74 48 69 C54 66 59 70 60 75 C61 70 66 66 72 69 C82 74 80 90 60 104 Z" {...fillG} /><path d="M60 58 v6 M50 61 l3 5 M70 61 l-3 5" {...g} /></g>);
    case 'crown': return (<g><path d="M40 100 L36 72 L49 84 L60 64 L71 84 L84 72 L80 100 Z" {...fillG} /><line x1="40" y1="106" x2="80" y2="106" {...g} /><circle cx="60" cy="88" r="3" fill="var(--tr-face)" /></g>);
    case 'wheel': return (<g><circle cx="60" cy="86" r="22" {...g} /><circle cx="60" cy="86" r="14" {...g} />{Array.from({ length: 8 }, (_, i) => { const r = (i * Math.PI) / 4; return <line key={i} x1={60 + Math.cos(r) * 5} y1={86 + Math.sin(r) * 5} x2={60 + Math.cos(r) * 22} y2={86 + Math.sin(r) * 22} {...g} />; })}<circle cx="60" cy="86" r="4" {...fillG} /></g>);
    case 'key': return (<g><circle cx="60" cy="72" r="9" {...g} strokeWidth={3} /><line x1="60" y1="81" x2="60" y2="108" {...g} strokeWidth={3} /><path d="M60 98 h8 M60 104 h6" {...g} strokeWidth={3} /></g>);
    case 'flame': return (<g><path d="M60 62 C70 76 76 84 72 96 C69 104 51 104 48 96 C45 88 52 84 54 76 C57 82 60 82 60 76 C60 70 58 66 60 62 Z" {...fillG} /><path d="M60 88 C64 92 64 98 60 100 C56 98 56 92 60 88 Z" fill="var(--tr-face)" /></g>);
    case 'eye': return (<g><path d="M36 86 Q60 62 84 86 Q60 110 36 86 Z" {...g} /><circle cx="60" cy="86" r="8" {...fillG} /><circle cx="62" cy="84" r="2" fill="var(--tr-face)" />{[-1, 0, 1].map(i => <line key={i} x1={60 + i * 12} y1={66 - Math.abs(i) * -3} x2={60 + i * 15} y2={60 + Math.abs(i) * 3} {...g} />)}</g>);
    case 'cup': return (<g><path d="M44 68 H76 C76 84 70 92 60 92 C50 92 44 84 44 68 Z" {...fillG} /><path d="M60 92 V104 M50 106 H70" {...g} strokeWidth={2.4} /><path d="M52 62 q2-4 0-8 M60 62 q2-4 0-8 M68 62 q2-4 0-8" {...g} /></g>);
    case 'leaf': return (<g><path d="M60 108 C40 92 42 70 60 60 C78 70 80 92 60 108 Z" {...fillG} /><path d="M60 104 V68 M60 92 l-8-7 M60 84 l8-7" stroke="var(--tr-face)" strokeWidth={1.4} fill="none" strokeLinecap="round" /></g>);
    case 'tower': return (<g><path d="M50 108 V74 H70 V108 Z" {...fillG} /><path d="M47 74 h26 l-3-8 h-20 Z" {...fillG} /><rect x="57" y="84" width="6" height="9" rx="3" fill="var(--tr-face)" /><path d="M78 58 l-6 10 h5 l-5 10" {...g} /></g>);
  }
}

/** 카드 앞면 — 금테 두 줄, 모서리 장식, 번호, 가운데 그림, 아래 이름 */
function CardFront({ no, en, motif }: { no: string; en: string; motif: Motif }) {
  return (
    <svg viewBox="0 0 120 190" className="tr-svg" aria-hidden>
      <defs>
        <radialGradient id="trHalo" cx="50%" cy="45%" r="50%">
          <stop offset="0" stopColor="var(--tr-glow)" stopOpacity=".9" />
          <stop offset="1" stopColor="var(--tr-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="118" height="188" rx="9" fill="var(--tr-face)" />
      <rect x="6" y="6" width="108" height="178" rx="6" fill="none" stroke="var(--tr-gold)" strokeWidth="1.2" />
      <rect x="9.5" y="9.5" width="101" height="171" rx="4" fill="none" stroke="var(--tr-gold)" strokeWidth=".5" opacity=".7" />
      {[[13, 13], [107, 13], [13, 177], [107, 177]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z`} fill="var(--tr-gold)" />
      ))}
      <text x="60" y="32" textAnchor="middle" className="tr-no">{no}</text>
      <line x1="44" y1="39" x2="76" y2="39" stroke="var(--tr-gold)" strokeWidth=".6" />
      <circle cx="60" cy="86" r="38" fill="url(#trHalo)" />
      <circle cx="60" cy="86" r="32" fill="none" stroke="var(--tr-gold)" strokeWidth=".6" strokeDasharray="1.5 3" />
      {[[26, 56], [96, 62], [30, 120], [92, 116], [60, 46]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 3} L${x + .8} ${y - .8} L${x + 3} ${y} L${x + .8} ${y + .8} L${x} ${y + 3} L${x - .8} ${y + .8} L${x - 3} ${y} L${x - .8} ${y - .8} Z`} fill="var(--tr-gold)" opacity=".75" />
      ))}
      <MotifArt m={motif} />
      <path d="M18 150 H102 L97 158 L102 166 H18 L23 158 Z" fill="none" stroke="var(--tr-gold)" strokeWidth=".9" />
      <text x="60" y="161" textAnchor="middle" className="tr-en" textLength={en.length > 11 ? 76 : undefined} lengthAdjust="spacingAndGlyphs">{en}</text>
    </svg>
  );
}

/** 카드 뒷면 — 해와 달, 별 무늬 */
function CardBack() {
  return (
    <svg viewBox="0 0 120 190" className="tr-svg" aria-hidden>
      <defs>
        <pattern id="trDots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r=".7" fill="var(--tr-gold)" opacity=".45" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="118" height="188" rx="9" fill="var(--tr-back)" />
      <rect x="6" y="6" width="108" height="178" rx="6" fill="url(#trDots)" stroke="var(--tr-gold)" strokeWidth="1.2" />
      <rect x="11" y="11" width="98" height="168" rx="4" fill="none" stroke="var(--tr-gold)" strokeWidth=".5" />
      <circle cx="60" cy="95" r="30" fill="var(--tr-back)" stroke="var(--tr-gold)" strokeWidth="1" />
      {Array.from({ length: 24 }, (_, i) => { const r = (i * Math.PI) / 12, l = i % 2 ? 36 : 42; return <line key={i} x1={60 + Math.cos(r) * 32} y1={95 + Math.sin(r) * 32} x2={60 + Math.cos(r) * l} y2={95 + Math.sin(r) * l} stroke="var(--tr-gold)" strokeWidth=".8" />; })}
      <path d="M64 77a18 18 0 1 0 0 36a24 24 0 0 1 0-36z" fill="var(--tr-gold)" />
      <path d="M60 30 l2 6 6 2 -6 2 -2 6 -2-6 -6-2 6-2z M60 144 l2 6 6 2 -6 2 -2 6 -2-6 -6-2 6-2z" fill="var(--tr-gold)" />
      {[[24, 30], [96, 30], [24, 160], [96, 160]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill="var(--tr-gold)" />)}
    </svg>
  );
}

export function TarotWidget() {
  const [st, setSt] = useState<Saved | null>(null);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (document.getElementById('tr-font')) return;
    const l = document.createElement('link');
    l.id = 'tr-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Myeongjo:wght@400;700;800&display=swap';
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    let alive = true;
    const prev = load();
    (async () => {
      let date = todayKst(), seed = '';
      try {
        const r = await fetch('/api/fortune', { cache: 'no-store' });
        if (r.ok) { const j = await r.json() as { date?: string; seed?: string }; if (j.date && j.seed) { date = j.date; seed = j.seed; } }
      } catch { /* 서버 없음 — 이 기기 씨앗 */ }
      if (!seed) seed = prev?.date === date ? prev.seed : localSeed();
      const next = { date, seed, drawn: prev?.date === date && !!prev.drawn };
      if (alive) { setSt(next); save(next); }
    })();
    return () => { alive = false; };
  }, []);

  const flip = () => {
    if (!st || st.drawn) return;
    const next = { ...st, drawn: true };
    setFlipping(true);
    setSt(next); save(next);
  };

  const p = st ? pick(st.seed) : null;
  const md = st ? `${Number(st.date.slice(5, 7))}.${Number(st.date.slice(8, 10))}` : '';
  return (
    <div className="panel widget tr-widget">
      <div className="tr-head"><span>✦</span> TODAY&apos;S CARD <span>✦</span></div>
      <div className={`tr-card ${st?.drawn ? 'open' : ''} ${flipping ? 'anim' : ''}`}
        role={st?.drawn ? undefined : 'button'} tabIndex={st?.drawn ? undefined : 0}
        aria-label={st?.drawn ? undefined : '카드 뒤집기'}
        onClick={flip} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
        <div className="tr-inner">
          <div className="tr-face tr-back"><CardBack /></div>
          <div className="tr-face tr-front">{p && <CardFront no={p.a.no} en={p.a.en} motif={p.a.motif} />}</div>
        </div>
      </div>
      {st?.drawn && p ? (
        <div className="tr-result">
          <div className="tr-name">{p.a.no} · {p.a.ko}</div>
          <p className="tr-msg">{p.f}</p>
          <div className="tr-foot">{md} · 내일 다시 만나요</div>
        </div>
      ) : (
        <div className="tr-result">
          <button type="button" className="tr-btn" disabled={!st} onClick={flip}>카드 뒤집기</button>
          <div className="tr-foot">하루에 한 번</div>
        </div>
      )}
    </div>
  );
}
