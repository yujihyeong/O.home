'use client';
// 대문 — 홈에 처음 들어오면 화면 전체에 뜨는 일러스트 (누르면 들어간다).
// 1번 그림은 낮 배경색, 2번 그림은 밤 배경색 위에 — 접속할 때마다 둘 중 하나가 랜덤.
// PC(가로 1920×1080)와 모바일(세로 1080×1920) 이미지를 따로 두고 화면 비율로 고른다.
// 대문 그림이 낮이면 입장한 홈도 낮, 밤이면 밤으로 시작한다 (사이트 모드가 낮/밤일 때).
// 한 번 들어가면 이 탭을 닫기 전까지는 다시 뜨지 않는다 (sessionStorage — layout 인라인 스크립트가 첫 페인트 전에 확인).
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SceneGlow } from '@/components/shell/SceneLayer';
import { useTheme } from '@/lib/ThemeProvider';

const KEY = 'ohome.gate.seen';
const PICKS = ['day', 'night'] as const;

export function EntryGate() {
  const pathname = usePathname();
  // 첫 화면이 홈일 때만 — 다른 페이지로 바로 들어온 링크는 막지 않는다
  const [state, setState] = useState<'hidden' | 'open' | 'leaving'>(() => (pathname === '/' ? 'open' : 'hidden'));
  const [pick, setPick] = useState<(typeof PICKS)[number] | null>(null);
  const { scene, setScene } = useTheme();

  useEffect(() => {
    if (state !== 'open') return;
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch { /* 무시 */ }
    if (seen) { setState('hidden'); return; }
    setPick(PICKS[Math.floor(Math.random() * PICKS.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 대문 그림과 같은 장면으로 — 대문이 걷히면 그 장면의 홈이 보이게 (뒤에서 미리 바꿔 둔다)
  // 그림이 정해질 때 한 번만 — 입장한 뒤 방문자가 스위치로 바꾸는 것은 막지 않는다
  useEffect(() => {
    if (pick && scene && scene !== pick) setScene(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  /* 아이폰 사파리는 화면 위(상태 표시줄)·아래(주소창) 띠를 페이지 배경색으로 칠한다 —
     대문은 그 위에 떠 있는 층이라, 뒤에 깔린 낮 배경(녹색)이 띠에 비쳤다 (사용자 제보).
     대문이 떠 있는 동안 문서 배경과 theme-color를 대문 색으로 맞추고, 걷히면 되돌린다 */
  useEffect(() => {
    if (!pick || state === 'hidden') return;
    const html = document.documentElement;
    const cls = `gate-${pick}`;
    html.classList.add(cls);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const made = !meta;
    const prev = meta?.content;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = pick === 'night' ? '#161a2e' : '#f6f3e7';
    return () => {
      html.classList.remove(cls);
      if (made) meta?.remove(); else if (meta && prev !== undefined) meta.content = prev;
    };
  }, [pick, state === 'hidden']);   // eslint-disable-line react-hooks/exhaustive-deps

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
    // 대문 위에서 화면을 끌어 올렸으면 문서가 밀린 채로 남는다 — 맨 위로 되돌린다
    window.scrollTo(0, 0);
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
