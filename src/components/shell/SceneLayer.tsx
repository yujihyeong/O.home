'use client';
// 낮/밤 장면의 배경 분위기 — 낮: 햇살·잔디 언덕·들꽃 / 밤: 별·달무리·흩날리는 벚꽃잎
// 무언가를 "그려 넣기"보다 분위기만 깔아 두는 쪽 — 전부 옅게, 콘텐츠 뒤(z-index -1)에서.
// 두 장면을 같이 두고 <html data-scene>으로 한쪽만 보이게 해, 전환할 때 천천히 겹쳐 바뀐다.
// 움직임 줄이기 설정이면 꽃잎·꽃가루가 멈춘다 (globals.css).
import React from 'react';
import { DAY_THEME, NIGHT_THEME } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeProvider';

/** 위치가 매번 바뀌면 hydration이 어긋난다 — 인덱스로 정해지는 의사난수 */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const FLOWERS = Array.from({ length: 22 }, (_, i) => ({
  left: 2 + rnd(i, 1) * 96,
  bottom: 1 + rnd(i, 2) * 13,
  size: 4 + rnd(i, 3) * 4,
  tone: i % 3,
}));
const MOTES = Array.from({ length: 9 }, (_, i) => ({
  left: rnd(i, 4) * 100,
  bottom: 6 + rnd(i, 5) * 30,
  delay: -rnd(i, 6) * 26,
  dur: 22 + rnd(i, 7) * 14,
}));
const PETALS = Array.from({ length: 16 }, (_, i) => ({
  left: rnd(i, 8) * 100,
  delay: -rnd(i, 9) * 30,
  dur: 18 + rnd(i, 10) * 16,
  sway: 4 + rnd(i, 11) * 5,
  size: 8 + rnd(i, 12) * 6,
  op: 0.35 + rnd(i, 13) * 0.4,
}));

export function SceneLayer() {
  const { sceneDecor } = useTheme();
  if (!sceneDecor) return null;
  return (
    <div className="scene" aria-hidden>
      <div className="scene-day"
        style={{ '--sc-g1': DAY_THEME.bgG1, '--sc-g2': DAY_THEME.bgG2 } as React.CSSProperties}>
        <div className="sun" />
        <svg className="meadow" viewBox="0 0 1440 240" preserveAspectRatio="none">
          <path d="M0 120 C 220 70 420 92 640 112 S 1080 64 1440 98 V240 H0 Z" fill="#c7d8b0" opacity=".55" />
          <path d="M0 160 C 260 118 520 150 760 140 S 1180 110 1440 146 V240 H0 Z" fill="#b3c99a" opacity=".5" />
          <path d="M0 196 C 300 170 620 192 900 182 S 1260 168 1440 186 V240 H0 Z" fill="#9fbb84" opacity=".42" />
        </svg>
        {FLOWERS.map((f, i) => (
          <span key={i} className={`flw t${f.tone}`}
            style={{ left: `${f.left}%`, bottom: `${f.bottom}vh`, width: f.size, height: f.size }} />
        ))}
        {MOTES.map((m, i) => (
          <span key={i} className="mote"
            style={{ left: `${m.left}%`, bottom: `${m.bottom}vh`, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />
        ))}
      </div>
      <div className="scene-night"
        style={{ '--sc-g1': NIGHT_THEME.bgG1, '--sc-g2': NIGHT_THEME.bgG2 } as React.CSSProperties}>
        <div className="stars" />
        <div className="stars s2" />
        <div className="halo" />
        {PETALS.map((p, i) => (
          <span key={i} className="petal-fall"
            style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}>
            <span className="petal"
              style={{ width: p.size, height: p.size * 0.72, opacity: p.op, animationDuration: `${p.sway}s` }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** 상단바의 낮/밤 전환 버튼 — 사이트 모드가 낮/밤일 때만 보인다 */
export function SceneToggle() {
  const { scene, setScene } = useTheme();
  if (!scene) return null;
  const next = scene === 'day' ? 'night' : 'day';
  return (
    <button className={`scene-tg ${scene}`} onClick={() => setScene(next)}
      aria-label={next === 'night' ? '밤으로' : '낮으로'} data-tip={next === 'night' ? '밤으로' : '낮으로'}>
      {scene === 'day' ? (
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></svg>
      ) : (
        <svg viewBox="0 0 24 24"><path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2Z" /></svg>
      )}
    </button>
  );
}
