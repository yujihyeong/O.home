'use client';
// 공통 드래그 정렬 리스트 (v1.9 — 들어 올림 + 빈 자리 + FLIP)
// 행 안의 .drag-h 핸들을 잡아 세로로 끌면 다른 행이 부드럽게 밀려나며 삽입 위치를 보여줌.
// 놓으면 정확한 슬롯 위치로 안착 애니메이션 후 커밋 — 커밋 프레임은 transition을 죽여 튀지 않게 (v1.9)
// 끄는 동안은 리액트 상태를 건드리지 않고 화면의 행만 직접 옮긴다 — 움직일 때마다 목록 전체를
// 다시 그리던 탓에 버벅이던 문제 (사용자 제보). 화면 반영은 한 프레임에 한 번.
import React, { useRef } from 'react';

export function DragList<T>({ items, keyOf, render, onReorder, disabled }: {
  items: T[];
  keyOf: (t: T) => string;
  render: (t: T, i: number) => React.ReactNode;
  onReorder: (items: T[]) => void;
  disabled?: boolean;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const onPointerDown = (e: React.PointerEvent, index: number) => {
    if (disabled || busy.current || e.button !== 0) return;
    if (!(e.target as HTMLElement).closest('.drag-h')) return;
    e.preventDefault();
    e.stopPropagation();   // 중첩 DragList(메뉴 트리 등)에서 바깥 리스트가 같이 끌리지 않게
    busy.current = true;
    const rows = Array.from(contRef.current!.children) as HTMLElement[];
    const rects = rows.map(r => r.getBoundingClientRect());
    const tops = rects.map(r => r.top), heights = rects.map(r => r.height);
    const me = rows[index], h = heights[index];
    const startY = e.clientY, pid = e.pointerId;
    let to = index, lastY = startY, raf = 0;
    /* 휴대폰에서 끌면 페이지가 같이 내려가던 문제 (사용자 제보) — 핸들은 CSS(touch-action:none)로 스크롤을 막고,
       대신 화면 위·아래 끝으로 끌면 목록이 알아서 스크롤된다. 스크롤된 만큼 끄는 행도 따라온다 */
    const sc = (contRef.current!.closest('#appMain') as HTMLElement | null)
      ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
    const st0 = sc.scrollTop;
    try { (e.target as HTMLElement).setPointerCapture(pid); } catch { /* 무시 */ }
    me.classList.add('lift');
    me.style.transition = 'none';
    me.style.willChange = 'transform';

    const paint = () => {
      raf = 0;
      // 가장자리 자동 스크롤
      const vr = sc === document.scrollingElement || sc === document.documentElement
        ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
      const edge = 70;
      let v = 0;
      if (lastY < vr.top + edge) v = -Math.ceil((vr.top + edge - lastY) / 5);
      else if (lastY > vr.bottom - edge) v = Math.ceil((lastY - (vr.bottom - edge)) / 5);
      if (v) {
        const before = sc.scrollTop;
        sc.scrollTop = before + Math.max(-18, Math.min(18, v));
        if (sc.scrollTop !== before) raf = requestAnimationFrame(paint);
      }
      const dy = lastY - startY + (sc.scrollTop - st0);
      const centerY = tops[index] + h / 2 + dy;
      let t = index;
      for (let j = 0; j < rows.length; j++) {
        const c = tops[j] + heights[j] / 2;
        if (j < index && centerY < c) t = Math.min(t, j);
        if (j > index && centerY > c) t = Math.max(t, j);
      }
      me.style.transform = `translateY(${dy}px) scale(1.02)`;
      if (t !== to) {
        to = t;
        rows.forEach((r, i) => {
          if (i === index) return;
          const off = index < to && i > index && i <= to ? -h : index > to && i >= to && i < index ? h : 0;
          r.style.transform = off ? `translateY(${off}px)` : '';
        });
      }
    };
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      lastY = ev.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ev.type === 'pointerup') { lastY = ev.clientY; paint(); }
      else to = index;
      // 들어 올린 행을 정확한 도착 슬롯 오프셋으로 부드럽게 안착시킨 뒤 커밋
      const target = to === index ? 0
        : (tops[to] - tops[index]) + (to > index ? heights[to] - h : 0);
      me.style.transition = 'transform .16s ease';
      me.style.transform = `translateY(${target}px)`;
      if (to === index) rows.forEach((r, i) => { if (i !== index) r.style.transform = ''; });
      window.setTimeout(() => {
        // 커밋 프레임은 transition 없이 — transform 해제 + DOM 순서 교체가 튀지 않게
        rows.forEach(r => { r.style.transition = 'none'; r.style.transform = ''; r.style.willChange = ''; });
        me.classList.remove('lift');
        if (to !== index) {
          const arr = [...items];
          const [m] = arr.splice(index, 1);
          arr.splice(to, 0, m);
          onReorder(arr);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          rows.forEach(r => { r.style.transition = ''; });
          busy.current = false;
        }));
      }, 170);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div ref={contRef}>
      {items.map((it, i) => (
        <div key={keyOf(it)} className="dl-row" onPointerDown={e => onPointerDown(e, i)}>
          {render(it, i)}
        </div>
      ))}
    </div>
  );
}
