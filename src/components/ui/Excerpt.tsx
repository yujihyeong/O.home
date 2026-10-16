'use client';
// 발췌 — 로그 글에서 원하는 문단을 눌러 골라 모아 보고 복사한다.
// 본문(HTML)을 그대로 그린 뒤, 문단(p·인용·제목·목록 한 줄)마다 번호를 붙여 누를 수 있게 한다.
import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/** 고를 수 있는 문단 — 본문 바로 아래 블록, 목록은 한 줄씩 */
function blocksOf(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') out.push(...(Array.from(el.children) as HTMLElement[]));
    else if (tag !== 'HR' && tag !== 'BR' && (el.textContent ?? '').trim()) out.push(el);
  }
  return out;
}

/** 목록 한 줄이면 앞에 표시를 붙여 글로 옮긴다 */
const textOf = (el: HTMLElement) => {
  const t = (el.innerText || el.textContent || '').trim();
  if (el.tagName === 'LI') return `· ${t}`;
  if (el.tagName === 'BLOCKQUOTE') return t.split('\n').map(l => `> ${l}`).join('\n');
  return t;
};

export function ExcerptBody({ html, active, onExit, title, author, style }: {
  html: string;
  active: boolean;          // 발췌 모드 — 문단을 눌러 고른다
  onExit: () => void;
  title: string;
  author: string;
  style?: React.CSSProperties;
}) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [view, setView] = useState(false);

  // 문단마다 번호 — 발췌 모드에서만 누를 수 있게 표시
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const list = blocksOf(root);
    list.forEach((el, i) => {
      if (active) { el.dataset.ex = String(i); el.classList.add('ex-able'); }
      else { delete el.dataset.ex; el.classList.remove('ex-able', 'ex-on'); }
    });
    if (!active) setPicked([]);
  }, [active, html]);

  // 고른 문단 표시
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-ex]').forEach(el =>
      el.classList.toggle('ex-on', picked.includes(Number(el.dataset.ex))));
  }, [picked]);

  const onClick = (e: React.MouseEvent) => {
    if (!active) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ex]');
    if (!el || !ref.current?.contains(el)) return;
    e.preventDefault();   // 문단 안 링크를 눌러도 이동하지 않고 고르기만
    const i = Number(el.dataset.ex);
    setPicked(l => (l.includes(i) ? l.filter(x => x !== i) : [...l, i]));
  };

  /** 본문 순서대로 모은 글 */
  const excerpt = () => {
    const root = ref.current;
    if (!root) return [];
    const list = blocksOf(root);
    return [...picked].sort((a, b) => a - b).map(i => list[i]).filter(Boolean).map(textOf);
  };

  const copy = async () => {
    const text = `${excerpt().join('\n\n')}\n\n— 「${title}」 · ${author}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('발췌한 문단을 복사했습니다');
    } catch {
      toast('복사하지 못했습니다 — 브라우저가 클립보드를 막았습니다');
    }
  };

  return (
    <>
      <div ref={ref} className={`post-body ${active ? 'ex-mode' : ''}`} style={style} onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }} />
      {active && (
        <div className="ex-bar">
          <span><b>{picked.length}</b>개 문단 {picked.length ? '골랐어요' : '— 발췌할 문단을 눌러 주세요'}</span>
          <button type="button" className="ghost" disabled={!picked.length} onClick={() => setPicked([])}>모두 해제</button>
          <button type="button" disabled={!picked.length} onClick={() => setView(true)}>발췌 보기</button>
          <button type="button" className="ghost" onClick={onExit}>끝내기</button>
        </div>
      )}
      <Modal open={view} onClose={() => setView(false)} title="발췌" desc={`「${title}」에서 고른 ${picked.length}개 문단 — 본문 순서대로`}>
        {view && (
          <div className="ex-card">
            {excerpt().map((t, i) => <p key={i}>{t}</p>)}
            <div className="ex-src">— 「{title}」 · {author}</div>
          </div>
        )}
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => setView(false)}>CLOSE</button>
          <button className="btn btn-dark" onClick={copy}>복사하기</button>
        </div>
      </Modal>
    </>
  );
}
