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

const Sun = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></svg>
);
const Moon = () => <svg viewBox="0 0 24 24"><path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2Z" /></svg>;

/**
 * 상단바 낮/밤 스위치 — 알약 모양 판 안에서 동그라미가 옆으로 옮겨 간다 (왼쪽 낮 · 오른쪽 밤).
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
      <span className="tg-ic sun"><Sun /></span>
      <span className="tg-ic moon"><Moon /></span>
      <span className="tg-knob">{night ? <Moon /> : <Sun />}</span>
    </button>
  );
}
