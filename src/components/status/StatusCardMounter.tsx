'use client';
// 글 속 상태창 자리표시(<div class="jsw-mount">)를 찾아 카드를 띄운다 (사용자 요청).
// 글 본문은 dangerouslySetInnerHTML로 그려져 React가 안을 모르므로, 화면 전체를 지켜보다 새 자리표시가 생기면
// 그 자리에 작은 React 루트를 하나씩 붙인다. 글이 바뀌어 자리표시가 사라지면 루트도 정리한다.
import { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusCard, type StatusCardProps } from './StatusCard';
import { DoveCard } from './DoveCard';

export function StatusCardMounter() {
  useEffect(() => {
    const roots = new Map<HTMLElement, Root>();
    let queued = false;
    const scan = () => {
      queued = false;
      document.querySelectorAll<HTMLElement>('.jsw-mount[data-jsw]').forEach(el => {
        if (roots.has(el)) return;
        let props: StatusCardProps & { kind?: string; text?: string } = {};
        try { props = JSON.parse(decodeURIComponent(el.dataset.jsw ?? '')); } catch { /* 빈 카드 */ }
        // 그림자 DOM에 띄운다 — 글 본문 스타일(.post-body ul 등)이 카드에 스며들지 않게
        const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
        const box = document.createElement('div');
        shadow.appendChild(box);
        const root = createRoot(box);
        // 종류별 카드 — 도브(본서사) 트래커 / 티팟 상태창
        root.render(props.kind === 'dove' ? <DoveCard text={props.text ?? ''} /> : <StatusCard {...props} />);
        roots.set(el, root);
      });
      for (const [el, root] of roots) {
        if (el.isConnected) continue;
        roots.delete(el);
        setTimeout(() => root.unmount(), 0);   // 렌더 도중 언마운트 경고를 피한다
      }
    };
    // 카드 글씨체 — 그림자 DOM 안의 @font-face는 먹지 않아 문서에 한 번 걸어 둔다
    if (!document.getElementById('jsw-font')) {
      const link = document.createElement('link');
      link.id = 'jsw-font'; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@500;700;900&display=swap';
      document.head.appendChild(link);
    }
    const kick = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
    scan();
    const mo = new MutationObserver(kick);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); roots.forEach(r => setTimeout(() => r.unmount(), 0)); };
  }, []);
  return null;
}
