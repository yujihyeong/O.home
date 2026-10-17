'use client';
// 지뢰찾기 팝업 (사용자 요청 — 위젯 대신) — 화면 왼쪽 아래 동그란 게임기 버튼, 누르면 게임기가 뜨고 다시 누르면 닫힌다.
// 오른쪽 아래는 BGM 플레이어 자리라 왼쪽에 둔다. 닫아도 판은 그대로 남아 이어서 할 수 있다(숨김만).
import React, { useState } from 'react';
import { MinesWidget } from '@/components/main/MinesWidget';

export function GameDock() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);   // 한 번 연 뒤로는 판을 유지
  return (
    <>
      {mounted && (
        <div className={`gdock-pop ${open ? 'on' : ''}`} role="dialog" aria-label="지뢰찾기" aria-hidden={!open}>
          <MinesWidget />
        </div>
      )}
      <button type="button" className={`gdock-btn ${open ? 'on' : ''}`}
        aria-label={open ? '지뢰찾기 닫기' : '지뢰찾기 열기'} data-tip={open ? '닫기' : '지뢰찾기'}
        onClick={() => { setMounted(true); setOpen(v => !v); }}>
        {/* 게임기 아이콘 — 십자키 + 버튼 두 개 */}
        <svg viewBox="0 0 32 32" aria-hidden>
          <rect x="3" y="8" width="26" height="17" rx="8.5" fill="currentColor" opacity=".18" />
          <rect x="3" y="8" width="26" height="17" rx="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M9.5 13.2v6.6M6.2 16.5h6.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="21" cy="18.4" r="1.9" fill="currentColor" />
          <circle cx="24.6" cy="14.6" r="1.9" fill="currentColor" />
        </svg>
      </button>
    </>
  );
}
