'use client';
/**
 * 짧은 주소 연결 (사용자 요청) — `/LOG`, `/OOC2`처럼 직접 지은 주소를 실제 페이지(게시판·섹션 등)에 잇는다.
 *
 * 커스텀 링크는 「이미 있는 페이지로 가는 지름길」이라, `/LOG`처럼 새 주소를 적어도 그 주소의 페이지가
 * 생기지는 않았다(없는 주소 → 「주소가 잘못되었거나 삭제된 페이지」). 이제 없는 주소로 들어오면
 * 여기서 연결을 찾아 그 페이지로 옮겨 준다. 관리자는 그 안내 화면에서 바로 연결할 곳을 고를 수 있다.
 *
 * 저장: { "log": "/board?b=abc", ... } — 키는 대소문자·공백·하이픈을 지운 한 단어 주소
 */
import { useEffect, useReducer } from 'react';
import { getSetting, setSetting } from './settingStore';

const KEY = 'ohome.aliases.v1';
const EVT = 'ohome-aliases';

/** 비교용 — 대소문자·공백·하이픈·밑줄 무시 */
export const aliasKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/^\/+/, '').replace(/[\s_-]+/g, '');

export function useAliases(): [Record<string, string>, (key: string, href: string | null) => void] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener(EVT, h);
    window.addEventListener('ohome-setting', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('ohome-setting', h); };
  }, []);
  const map = getSetting<Record<string, string>>(KEY, {}) ?? {};
  const set = (key: string, href: string | null) => {
    const next = { ...(getSetting<Record<string, string>>(KEY, {}) ?? {}) };
    if (href) next[aliasKey(key)] = href; else delete next[aliasKey(key)];
    setSetting(KEY, next);
    try { window.dispatchEvent(new Event(EVT)); } catch { /* 무시 */ }
  };
  return [map, set];
}
