'use client';
// 글 머리말 (사용자 요청) — 제목 앞에 [머리말]로 붙는다. 종류는 게시판마다 관리자가 직접 써서 추가한다
import React from 'react';

export function PostHead({ cat }: { cat?: string }) {
  const c = cat?.trim();
  return c ? <span className="post-head">[{c}]</span> : null;
}
