'use client';
// 오늘의 대사 꾸밈 풍경 (사용자 요청) — 대사가 짧아 위젯 아래가 비면 그 빈 곳을 풍경 그림으로 채운다.
// 남은 높이만큼 늘어나는 칸에 SVG를 아래쪽 기준으로 깔아서, 빈 곳이 크면 많이, 작으면 조금 보인다.
// 무늬는 위젯마다 같은 모양이 나오도록 정해진 씨앗(seed)으로 뿌린다.
import React, { useMemo } from 'react';

export const QUOTE_SCENES: { id: string; label: string }[] = [
  { id: 'off', label: '없음' },
  { id: 'flowers', label: '🌷 꽃밭' },
  { id: 'night', label: '🌙 밤하늘' },
  { id: 'sea', label: '🌊 바다' },
  { id: 'blossom', label: '🌸 벚꽃 비' },
  { id: 'clouds', label: '☁️ 구름' },
];

/** 같은 씨앗이면 늘 같은 순서의 난수 */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const W = 300, H = 120;

function Flowers() {
  const items = useMemo(() => {
    const r = rng(7);
    const cols = ['#f4a6b8', '#f7c873', '#c9b2f0', '#f2b6d2', '#ffffff', '#a8d4f0'];
    const blades = Array.from({ length: 70 }, () => {
      const x = r() * W, h = 10 + r() * 22, lean = (r() - 0.5) * 10;
      return `M${x.toFixed(1)},${H} q${(lean / 2).toFixed(1)},${(-h / 2).toFixed(1)} ${lean.toFixed(1)},${(-h).toFixed(1)}`;
    });
    const flowers = Array.from({ length: 26 }, (_, i) => {
      const x = (i + 0.5) * (W / 26) + (r() - 0.5) * 8;
      const stem = 16 + r() * 34;
      return { x, y: H - stem, stem, size: 3 + r() * 2.6, col: cols[Math.floor(r() * cols.length)], rot: r() * 72 };
    });
    return { blades, flowers };
  }, []);
  return (
    <g>
      <path d={`M0,${H} Q75,${H - 14} 150,${H - 8} T300,${H - 10} V${H} Z`} fill="#a9cf96" opacity=".35" />
      {items.blades.map((d, i) => <path key={i} d={d} stroke="#7fb36d" strokeWidth="1.2" fill="none" opacity=".55" strokeLinecap="round" />)}
      {items.flowers.map((f, i) => (
        <g key={i}>
          <path d={`M${f.x},${H} Q${f.x + 2},${H - f.stem / 2} ${f.x},${f.y}`} stroke="#6fa65f" strokeWidth="1" fill="none" opacity=".7" />
          <g transform={`translate(${f.x},${f.y}) rotate(${f.rot})`} className="qs-sway" style={{ animationDelay: `${(i % 7) * -0.6}s` }}>
            {[0, 72, 144, 216, 288].map(a => (
              <ellipse key={a} cx="0" cy={-f.size * 0.9} rx={f.size * 0.55} ry={f.size * 0.9} fill={f.col} transform={`rotate(${a})`} opacity=".92" />
            ))}
            <circle r={f.size * 0.45} fill="#ffd96a" />
          </g>
        </g>
      ))}
    </g>
  );
}

function Night() {
  const stars = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: 46 }, () => ({ x: r() * W, y: r() * (H - 26), s: 0.5 + r() * 1.4, d: r() * 4, big: r() < 0.14 }));
  }, []);
  return (
    <g>
      <defs>
        <linearGradient id="qsNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2547" stopOpacity="0" />
          <stop offset=".55" stopColor="#2a2f5e" stopOpacity=".55" />
          <stop offset="1" stopColor="#3a3570" stopOpacity=".85" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#qsNight)" />
      {stars.map((st, i) => st.big
        ? <path key={i} className="qs-twinkle" style={{ animationDelay: `${st.d}s` }} fill="#fff6d8"
            d={`M${st.x},${st.y - 3.6} L${st.x + 0.9},${st.y - 0.9} L${st.x + 3.6},${st.y} L${st.x + 0.9},${st.y + 0.9} L${st.x},${st.y + 3.6} L${st.x - 0.9},${st.y + 0.9} L${st.x - 3.6},${st.y} L${st.x - 0.9},${st.y - 0.9} Z`} />
        : <circle key={i} className="qs-twinkle" style={{ animationDelay: `${st.d}s` }} cx={st.x} cy={st.y} r={st.s} fill="#fffbe9" />)}
      <g transform={`translate(${W * 0.66},30)`}>
        <mask id="qsMoon"><circle r="11" fill="#fff" /><circle r="11" cx="5" cy="-3" fill="#000" /></mask>
        <circle r="16" fill="#fff4c4" opacity=".18" />
        <circle r="11" fill="#fff4c4" mask="url(#qsMoon)" />
      </g>
      <path d={`M0,${H} Q50,${H - 18} 110,${H - 10} T220,${H - 14} T300,${H - 8} V${H} Z`} fill="#161a33" opacity=".75" />
    </g>
  );
}

function Sea() {
  const wave = (y: number, amp: number, len: number) => {
    let d = `M0,${y}`;
    for (let x = 0; x <= W * 2; x += len) d += ` q${len / 4},${-amp} ${len / 2},0 t${len / 2},0`;
    return d + ` V${H} H0 Z`;
  };
  return (
    <g>
      <g className="qs-drift" style={{ animationDuration: '9s' }}><path d={wave(H - 34, 5, 60)} fill="#9fd3ea" opacity=".35" /></g>
      <g className="qs-drift" style={{ animationDuration: '6s', animationDirection: 'reverse' }}><path d={wave(H - 22, 6, 40)} fill="#77bfe0" opacity=".42" /></g>
      <g className="qs-drift" style={{ animationDuration: '4.5s' }}><path d={wave(H - 11, 4, 30)} fill="#5aa9d4" opacity=".5" /></g>
      {[40, 120, 210, 260].map((x, i) => (
        <circle key={x} className="qs-twinkle" style={{ animationDelay: `${i * 0.7}s` }} cx={x} cy={H - 28 - (i % 2) * 6} r="1.4" fill="#fff" />
      ))}
    </g>
  );
}

function Blossom() {
  const petals = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 22 }, () => ({ x: r() * W, y: r() * H, s: 2.6 + r() * 2.4, d: r() * 6, rot: r() * 360, dur: 5 + r() * 4 }));
  }, []);
  return (
    <g>
      <path d={`M0,${H} Q80,${H - 8} 150,${H - 5} T300,${H - 7} V${H} Z`} fill="#f6c6d6" opacity=".45" />
      {petals.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <g className="qs-fall" style={{ animationDelay: `${-p.d}s`, animationDuration: `${p.dur}s` }}>
            <path transform={`rotate(${p.rot}) scale(${p.s / 4})`} d="M0,-4 C3,-4 4,0 0,4 C-4,0 -3,-4 0,-4 Z M0,-4 L0,-2.4" fill="#f7b6cb" opacity=".9" />
          </g>
        </g>
      ))}
    </g>
  );
}

function Clouds() {
  const cloud = (x: number, y: number, s: number, op: number) => (
    <g transform={`translate(${x},${y}) scale(${s})`} opacity={op} style={{ filter: 'drop-shadow(0 2px 3px rgba(120,140,170,.35))' }}>
      <ellipse cx="0" cy="0" rx="18" ry="10" fill="#fff" />
      <ellipse cx="14" cy="-5" rx="13" ry="11" fill="#fff" />
      <ellipse cx="28" cy="1" rx="14" ry="9" fill="#fff" />
      <rect x="-14" y="0" width="54" height="9" rx="4.5" fill="#fff" />
    </g>
  );
  return (
    <g>
      <g className="qs-drift" style={{ animationDuration: '30s' }}>
        {cloud(20, H - 40, 1.1, 0.9)}{cloud(140, H - 62, 0.8, 0.75)}{cloud(220, H - 26, 1.3, 0.95)}
        {cloud(320, H - 40, 1.1, 0.9)}{cloud(440, H - 62, 0.8, 0.75)}{cloud(520, H - 26, 1.3, 0.95)}
      </g>
    </g>
  );
}

/** 남은 빈 곳을 채우는 풍경 — 칸 높이에 맞춰 아래쪽 기준으로 깔린다 */
export function QuoteScene({ kind }: { kind: string }) {
  const body = kind === 'flowers' ? <Flowers /> : kind === 'night' ? <Night /> : kind === 'sea' ? <Sea />
    : kind === 'blossom' ? <Blossom /> : kind === 'clouds' ? <Clouds /> : null;
  if (!body) return null;
  return (
    <div className={`qt-scene qs-${kind}`} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">{body}</svg>
    </div>
  );
}
