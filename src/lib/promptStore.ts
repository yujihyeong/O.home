'use client';
/**
 * 프롬프트 게시판 (사용자 요청) — 캐릭터 하나 = 글 하나, 글 안에 복장별 탭(인덱스).
 * 탭마다 이미지 한 장 + 프롬프트 한 덩어리. 글 테이블을 새로 만들지 않고(포크가 SQL을 다시 돌릴 일 없게)
 * 인포·소개처럼 설정 한 칸에 담아 서버에 동기화한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';
import { newId } from './postStore';

const KEY = 'ohome.prompt.v1';

export interface PromptTab { id: string; name: string; img: string | null; prompt: string }
export interface PromptPost { id: string; title: string; tabs: PromptTab[]; date: string }

export const newTab = (name = ''): PromptTab => ({ id: newId(), name, img: null, prompt: '' });
export const newPromptPost = (): PromptPost => ({ id: newId(), title: '', tabs: [newTab('기본')], date: new Date().toISOString() });

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function norm(raw: unknown): PromptPost[] {
  const list = Array.isArray((raw as { posts?: unknown })?.posts) ? (raw as { posts: unknown[] }).posts : [];
  return list.map(p => {
    const o = (p ?? {}) as Record<string, unknown>;
    const tabs = (Array.isArray(o.tabs) ? o.tabs : []).map(t => {
      const q = (t ?? {}) as Record<string, unknown>;
      return { id: str(q.id) || newId(), name: str(q.name), img: typeof q.img === 'string' ? q.img : null, prompt: str(q.prompt) };
    });
    return { id: str(o.id) || newId(), title: str(o.title), tabs: tabs.length ? tabs : [newTab('기본')], date: str(o.date) || new Date().toISOString() };
  });
}

export function usePrompts(): [PromptPost[], (next: PromptPost[]) => void, boolean] {
  const [posts, setPosts] = useState<PromptPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) setPosts(norm(JSON.parse(raw)));
    } catch { /* 빈 목록 */ }
    setLoaded(true);
  }, []);
  const save = useCallback((next: PromptPost[]) => {
    setPosts(next);
    try { setSetting(KEY, { posts: next }); } catch { /* 무시 */ }
  }, []);
  return [posts, save, loaded];
}
