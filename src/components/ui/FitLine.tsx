'use client';
// 한 줄 맞춤 (사용자 요청 — 글 제목이 목록에선 잘리고 본문에선 두 줄이 됐다).
// 줄을 바꾸지 않고, 넘치면 글자 크기를 조금씩 줄여 한 줄에 다 들어오게 한다 (원래 크기의 min배까지).
import React, { useLayoutEffect, useRef } from 'react';

export function FitLine<T extends 'b' | 'h2' | 'span'>({ as, min = 0.7, style, children, ...rest }: {
  as: T; min?: number; style?: React.CSSProperties; children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'style' | 'children'>) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!base || el.clientWidth <= 0) return;
      let size = base;
      // 넘치면 0.5px씩 줄인다 — 보통 몇 번 안 돈다
      while (el.scrollWidth > el.clientWidth && size > base * min) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // 너비가 바뀔 때만 다시 맞춘다 — 글씨 크기를 바꿔 생긴 높이 변화로 되풀이되지 않게
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} {...rest} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, ...style }}>
      {children}
    </Tag>
  );
}
