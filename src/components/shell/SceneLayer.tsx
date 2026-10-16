'use client';
// 낮/밤 장면의 배경 — 그라데이션 색만 깐다 (꾸밈 요소 없음).
// 두 장면을 같이 두고 <html data-scene>으로 한쪽만 보이게 해, 전환할 때 색이 천천히 섞이며 바뀐다.
import React from 'react';
import { DAY_THEME, NIGHT_THEME } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeProvider';

export function SceneLayer() {
  const { sceneDecor } = useTheme();
  if (!sceneDecor) return null;
  return (
    <div className="scene" aria-hidden>
      <div className="scene-day" style={{ '--sc-g1': DAY_THEME.bgG1, '--sc-g2': DAY_THEME.bgG2 } as React.CSSProperties} />
      <div className="scene-night" style={{ '--sc-g1': NIGHT_THEME.bgG1, '--sc-g2': NIGHT_THEME.bgG2 } as React.CSSProperties} />
    </div>
  );
}

/* 일러스트풍 스위치 — 크레용 같은 둥근 테두리, 볼터치 얼굴의 해·달, 구름과 별 */
const LINE = '#7d7489';

/** 해 — 노란 얼굴에 볼터치 */
const SunFace = () => (
  <svg viewBox="0 0 26 26" className="face">
    <circle cx="13" cy="13" r="11.2" fill="#ffe28a" stroke={LINE} strokeWidth="1.6" />
    <circle cx="9.4" cy="12.2" r="1.15" fill={LINE} />
    <circle cx="16.6" cy="12.2" r="1.15" fill={LINE} />
    <ellipse cx="7.6" cy="15.4" rx="1.9" ry="1.2" fill="#ffa9a2" opacity=".85" />
    <ellipse cx="18.4" cy="15.4" rx="1.9" ry="1.2" fill="#ffa9a2" opacity=".85" />
    <path d="M11.4 15.2q1.6 1.5 3.2 0" fill="none" stroke={LINE} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

/** 달 — 잠든 얼굴, 크레이터, 볼터치 */
const MoonFace = () => (
  <svg viewBox="0 0 26 26" className="face">
    <circle cx="13" cy="13" r="11.2" fill="#f5eeff" stroke={LINE} strokeWidth="1.6" />
    <circle cx="17.8" cy="7.6" r="1.6" fill="#e0d4f2" />
    <circle cx="7.4" cy="8.6" r="1" fill="#e0d4f2" />
    <path d="M8 12.6q1.4 1.3 2.8 0M15.2 12.6q1.4 1.3 2.8 0" fill="none" stroke={LINE} strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="7.6" cy="15.6" rx="1.9" ry="1.2" fill="#f7a8c4" opacity=".8" />
    <ellipse cx="18.4" cy="15.6" rx="1.9" ry="1.2" fill="#f7a8c4" opacity=".8" />
    <path d="M12 16.4q1 .8 2 0" fill="none" stroke={LINE} strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);

const star = (x: number, y: number, r: number) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    p.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return p.join(' ');
};

/** 판 위의 그림 — 낮: 구름 두 조각 (오른쪽) / 밤: 파스텔 별 (왼쪽) */
const TrackArt = () => (
  <svg viewBox="0 0 64 32" className="tg-art" aria-hidden>
    <g className="art-day">
      <path d="M38.5 21.5h11a3.2 3.2 0 0 0 .3-6.4 4.4 4.4 0 0 0-8.4-1 3.4 3.4 0 0 0-2.9 7.4Z"
        fill="#fff" stroke={LINE} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M50.5 12.4h6a2 2 0 0 0 .1-4 2.8 2.8 0 0 0-5.3-.5 2 2 0 0 0-.8 4.5Z"
        fill="#fff" stroke={LINE} strokeWidth="1.1" strokeLinejoin="round" />
    </g>
    <g className="art-night">
      <polygon points={star(11, 10, 3.6)} fill="#ffe9a0" stroke={LINE} strokeWidth=".9" strokeLinejoin="round" />
      <polygon points={star(21, 21, 3)} fill="#ffc6dc" stroke={LINE} strokeWidth=".9" strokeLinejoin="round" />
      <polygon points={star(27, 9, 2.2)} fill="#c9e4ff" stroke={LINE} strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="8" cy="22" r=".9" fill="#fff6d8" />
      <circle cx="17" cy="6" r=".7" fill="#fff6d8" />
    </g>
  </svg>
);

/**
 * 상단바 낮/밤 스위치 — 알약 모양 판 안에서 동그라미(해·달)가 옆으로 옮겨 간다 (왼쪽 낮 · 오른쪽 밤).
 * 누르면 배경색과 메뉴가 함께 바뀐다. 사이트 모드가 낮/밤일 때만 보인다.
 */
export function SceneToggle() {
  const { scene, setScene } = useTheme();
  if (!scene) return null;
  const night = scene === 'night';
  return (
    <button type="button" role="switch" aria-checked={night} aria-label="밤 모드"
      className={`scene-tg ${scene}`} data-tip={night ? '낮으로' : '밤으로'}
      onClick={() => setScene(night ? 'day' : 'night')}>
      <TrackArt />
      <span className="tg-knob">
        <span className="k-sun"><SunFace /></span>
        <span className="k-moon"><MoonFace /></span>
      </span>
    </button>
  );
}
