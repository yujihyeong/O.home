// 선 아이콘 (사용자 요청 — 이모지 대신 아이콘) — 글씨색을 따라가고 글자 줄에 맞춰 놓인다
import React from 'react';

type P = { size?: number; className?: string; style?: React.CSSProperties; title?: string };
const svg = (p: P, body: React.ReactNode) => (
  <svg className={`ic-line ${p.className ?? ''}`} style={p.style} width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden={p.title ? undefined : true} role={p.title ? 'img' : undefined}>
    {p.title && <title>{p.title}</title>}
    {body}
  </svg>
);

/** 자물쇠 — open이면 열린 자물쇠 */
export const LockIcon = (p: P & { open?: boolean }) => svg(p, <>
  <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
  <path d={p.open ? 'M8 10.5V7.5a4 4 0 0 1 7.6-1.7' : 'M8 10.5V7.5a4 4 0 0 1 8 0v3'} />
  <circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
</>);

/** 그림 */
export const ImageIcon = (p: P) => svg(p, <>
  <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
  <circle cx="9" cy="9.5" r="1.6" />
  <path d="m4.5 17.5 4.8-4.6 3.4 3.1 2.7-2.4 4.1 3.9" />
</>);

/** 공유 — 네모에서 위로 나가는 화살표 */
export const ShareIcon = (p: P) => svg(p, <>
  <path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
</>);
