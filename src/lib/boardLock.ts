'use client';
// 게시판 비밀번호 (사용자 요청) — 잠긴 게시판의 글 본문·이미지·대표 사진을 프롬프트 게시판 비밀번호의 콘텐츠 키로 봉한다.
// 게시판 잠금을 풀면 그 잠금으로 봉했던 글(boardSealed)만 다시 푼다 — 글마다 직접 건 잠금은 그대로 둔다.
import type { Post } from './postStore';
import type { Board } from './boardStore';
import { sealBody, openBody, postContentKey } from './promptStore';

export interface SealedPost {
  body: string; images?: string[]; caption?: string;
  thumbSrc?: string; thumbCrop?: Post['thumbCrop'];
}

/** 글 내용을 봉한 모습으로 — 겉에는 제목·작성자 같은 목록 정보만 남는다 */
export async function sealPost(k: CryptoKey, p: Post, boardSealed: boolean): Promise<Post> {
  const locked = await sealBody(k, {
    body: p.body, images: p.images, caption: p.caption, thumbSrc: p.thumbSrc, thumbCrop: p.thumbCrop,
  } satisfies SealedPost);
  return {
    ...p, body: '', images: undefined, caption: undefined, thumbSrc: undefined, thumbCrop: undefined,
    locked, boardSealed: boardSealed || undefined,
  };
}

/** 봉한 글을 원래대로 — 못 풀면 그대로 돌려준다 */
export async function unsealPost(k: CryptoKey, p: Post): Promise<Post> {
  if (!p.locked) return p;
  try {
    const o = await openBody<SealedPost>(k, p.locked);
    return {
      ...p, body: o.body ?? '', images: o.images, caption: o.caption, thumbSrc: o.thumbSrc, thumbCrop: o.thumbCrop,
      locked: undefined, boardSealed: undefined,
    };
  } catch { return p; }
}

/* ---------- 게시판 비밀번호 고르기 (사용자 요청) — 자동으로 바뀌는 비밀번호 / 직접 정한 비밀번호 ----------
   직접 정하면 그 게시판만의 콘텐츠 키(Kb)를 만들어 글을 봉하고, Kb는 그 비밀번호(PBKDF2)로 잠가 게시판 설정에 둔다.
   비밀번호를 바꿔도 Kb만 다시 잠그면 되므로 글은 다시 봉하지 않는다. 매달 자동 변경과는 무관하다 */
export interface BoardOwnLock { salt: string; iv: string; data: string }

const enc = new TextEncoder();
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derive(pw: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 200000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const importK = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', true, ['encrypt', 'decrypt']);
async function wrap(pw: string, k: CryptoKey, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<BoardOwnLock> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await derive(pw, salt),
    await crypto.subtle.exportKey('raw', k));
  return { salt: b64(salt), iv: b64(iv), data: b64(data) };
}

// 이 탭에서 한 번 열면 다시 묻지 않게 · 관리자 기기에는 남겨 두기 (프롬프트 게시판과 같은 방식)
const sKey = (id: string) => `ohome.board.unlock.${id}`;
const aKey = (id: string) => `ohome.board.adminkey.${id}`;
async function remember(b: Board, k: CryptoKey, admin: boolean) {
  try {
    const v = JSON.stringify({ salt: b.lockOwn?.salt, k: b64(await crypto.subtle.exportKey('raw', k)) });
    sessionStorage.setItem(sKey(b.id), v);
    if (admin) localStorage.setItem(aKey(b.id), v);
  } catch { /* 무시 */ }
}
async function recall(b: Board, admin: boolean): Promise<CryptoKey | null> {
  try {
    const r = JSON.parse(sessionStorage.getItem(sKey(b.id)) ?? (admin ? localStorage.getItem(aKey(b.id)) : null) ?? 'null');
    if (!r || r.salt !== b.lockOwn?.salt) return null;
    return await importK(unb64(r.k));
  } catch { return null; }
}

/** 직접 정한 비밀번호로 새 잠금 — 게시판 키와 그 키를 잠근 값 */
export async function createOwnLock(pw: string): Promise<{ lock: BoardOwnLock; key: CryptoKey }> {
  const key = await importK(crypto.getRandomValues(new Uint8Array(32)));
  return { lock: await wrap(pw, key), key };
}
/** 직접 정한 비밀번호 바꾸기 — 키는 그대로, 잠근 값만 새로 */
export const rewrapOwnLock = (pw: string, key: CryptoKey) => wrap(pw, key);

/** 그 게시판 글을 여는 키 — 자동 비밀번호면 프롬프트 게시판 키, 직접 정했으면 그 게시판 키.
 *  pw가 있으면 그 비밀번호로 열고(맞으면 기억), 없으면 이 탭·관리자 기기에 기억된 키로 */
export async function boardKey(b: Board, admin: boolean, pw?: string): Promise<CryptoKey | null> {
  if (!b.lockOwn) return postContentKey(admin, pw);
  if (!pw) return recall(b, admin);
  try {
    const l = b.lockOwn;
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(l.iv) as BufferSource },
      await derive(pw, unb64(l.salt)), unb64(l.data) as BufferSource);
    const k = await importK(new Uint8Array(raw));
    await remember(b, k, admin);
    return k;
  } catch { return null; }
}
/** 방금 만든·바꾼 키를 이 기기에 기억 (관리자) */
export const rememberBoardKey = (b: Board, k: CryptoKey) => remember(b, k, true);
