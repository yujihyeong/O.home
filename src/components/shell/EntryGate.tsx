'use client';
// 대문 — 홈에 처음 들어오면 화면 전체에 뜨는 일러스트 (누르면 들어간다).
// 1번 그림은 낮 배경색, 2번 그림은 밤 배경색 위에 — 접속할 때마다 둘 중 하나가 랜덤.
// PC(가로 1920×1080)와 모바일(세로 1080×1920) 이미지를 따로 두고 화면 비율로 고른다.
// 한 번 들어가면 이 탭을 닫기 전까지는 다시 뜨지 않는다 (sessionStorage — layout 인라인 스크립트가 첫 페인트 전에 확인).
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SceneGlow } from '@/components/shell/SceneLayer';

const KEY = 'ohome.gate.seen';
const PICKS = ['day', 'night'] as const;

export function EntryGate() {
  const pathname = usePathname();
  // 첫 화면이 홈일 때만 — 다른 페이지로 바로 들어온 링크는 막지 않는다
  const [state, setState] = useState<'hidden' | 'open' | 'leaving'>(() => (pathname === '/' ? 'open' : 'hidden'));
  const [pick, setPick] = useState<(typeof PICKS)[number] | null>(null);

  useEffect(() => {
    if (state !== 'open') return;
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch { /* 무시 */ }
    if (seen) { setState('hidden'); return; }
    setPick(PICKS[Math.floor(Math.random() * PICKS.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 키보드로도 — Enter·Space·Esc
  useEffect(() => {
    if (state !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); enter(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (state === 'hidden') return null;
  function enter() {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* 무시 */ }
    setState('leaving');
    setTimeout(() => setState('hidden'), 650);
  }
  return (
    <div className={`gate ${pick ?? ''} ${state === 'leaving' ? 'out' : ''}`} onClick={enter}
      role="dialog" aria-label="대문">
      {pick && (
        <picture>
          <source media="(max-aspect-ratio: 1/1)" srcSet={`/gate/${pick}-m.webp`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/gate/${pick}-pc.webp`} alt="" />
        </picture>
      )}
      {pick && <SceneGlow scene={pick} />}
      <button type="button" className="gate-enter" onClick={e => { e.stopPropagation(); enter(); }}>
        ENTER
      </button>
    </div>
  );
}
