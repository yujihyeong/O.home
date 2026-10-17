'use client';
// 검색 위젯 (사용자 요청) — 내 홈 게시글(모든 게시판)에서 검색어가 들어간 글을 찾아 아래로 펼쳐 보여 준다.
// 제목·태그·본문(비밀글은 읽을 수 있는 사람만)에서 찾고, 누르면 그 글로 이동. 메뉴에서 비공개로 둔 게시판은 빠진다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canViewHref } from '@/lib/menuStore';
import { useBoards, MAIN_BOARD_ID } from '@/lib/boardStore';
import { useLocalList, Post, BOARD_SEED } from '@/lib/postStore';

const MAX = 30;

/** 본문 → 검색용 맨글자 (HTML 태그·마크다운 기호·엔티티 제거) */
function plain(s: string): string {
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // 마크다운 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')        // 마크다운 링크 → 글자만
    .replace(/[*_~`>#|]+/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 찾은 단어를 형광으로 */
function Hl({ text, k }: { text: string; k: string }) {
  if (!k) return <>{text}</>;
  const out: React.ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0, n = 0;
  while (i < text.length) {
    const j = low.indexOf(k, i);
    if (j < 0) { out.push(text.slice(i)); break; }
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={n++}>{text.slice(j, j + k.length)}</mark>);
    i = j + k.length;
  }
  return <>{out}</>;
}

interface Hit { p: Post; board: string; snip: string; tag?: string }

export function SearchWidget(_: { conf: WidgetConf }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const [menuSet] = useMenuSettings();
  const { boards } = useBoards();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const k = q.trim().toLowerCase();

  // 플레인 텍스트는 글이 바뀔 때만 다시 만든다
  const index = useMemo(() => {
    const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
    const bname = new Map(boards.map(b => [b.id, b.name]));
    return posts
      .filter(p => {
        const b = p.boardId ?? MAIN_BOARD_ID;
        return canViewHref(menuSet, b === MAIN_BOARD_ID ? '/board' : `/board?b=${b}`, viewer);
      })
      // 비밀글은 읽을 수 있는 사람(관리자·작성자)에게만 걸린다
      .filter(p => !p.secret || isAdmin || (!!p.authorId && p.authorId === user?.id))
      .map(p => ({
        p,
        board: bname.get(p.boardId ?? MAIN_BOARD_ID) ?? '',
        text: plain(`${p.body} ${p.caption ?? ''}`),
      }));
  }, [posts, menuSet, boards, user, isAdmin]);

  const hits: Hit[] = useMemo(() => {
    if (!k) return [];
    const out: Hit[] = [];
    for (const it of index) {
      const inTitle = it.p.title.toLowerCase().includes(k);
      const tag = (it.p.tags ?? []).find(t => t.toLowerCase().includes(k));
      const inTag = !!tag;
      const at = it.text.toLowerCase().indexOf(k);
      if (!inTitle && !inTag && at < 0) continue;
      // 본문에서 찾았으면 그 앞뒤를 조금 잘라 보여 준다
      let snip = '';
      if (at >= 0) {
        const s = Math.max(0, at - 18);
        snip = (s > 0 ? '…' : '') + it.text.slice(s, at + k.length + 40) + (at + k.length + 40 < it.text.length ? '…' : '');
      }
      out.push({ p: it.p, board: it.board, snip, tag: !inTitle && at < 0 ? tag : undefined });
    }
    return out.sort((a, b) => b.p.date.localeCompare(a.p.date)).slice(0, MAX);
  }, [index, k]);

  // 결과 창은 화면 위에 띄운다 — 위젯 판이 잘라 먹지 않게
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6, width });
    };
    place();
    const out = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('pointerdown', out);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => { if (editOn) setOpen(false); }, [editOn]);

  const go = (p: Post) => { setOpen(false); router.push(`/board/${p.id}`); };
  const date = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');

  return (
    <div className="panel widget sw-widget">
      <h4>SEARCH</h4>
      <form ref={boxRef} className="sw-box" role="search"
        onSubmit={e => { e.preventDefault(); if (k) setOpen(true); }}>
        <input type="search" value={q} placeholder="게시글 검색" disabled={editOn} aria-label="게시글 검색"
          onChange={e => { setQ(e.target.value); setOpen(!!e.target.value.trim()); }}
          onFocus={() => { if (k) setOpen(true); }} />
        {q && <button type="button" className="sw-x" aria-label="지우기" onClick={() => { setQ(''); setOpen(false); }}>✕</button>}
        <button type="submit" className="sw-go" aria-label="검색" disabled={editOn}>
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </form>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} className="sw-pop" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          <div className="sw-cnt">「{q.trim()}」 검색 결과 {hits.length >= MAX ? `${MAX}개+` : `${hits.length}개`}</div>
          {hits.length === 0
            ? <p className="sw-none">검색어가 들어간 게시글이 없어요</p>
            : (
              <ul>
                {hits.map(h => (
                  <li key={h.p.id} onClick={() => go(h.p)}>
                    <b><Hl text={h.p.title} k={k} /></b>
                    {h.snip && <span className="sw-snip"><Hl text={h.snip} k={k} /></span>}
                    {h.tag && <span className="sw-snip">#<Hl text={h.tag} k={k} /></span>}
                    <small>{h.board && <>{h.board} · </>}{date(h.p.date)}{h.p.secret ? ' · 🔒' : ''}</small>
                  </li>
                ))}
              </ul>
            )}
        </div>,
        document.body,
      )}
    </div>
  );
}
