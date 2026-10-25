'use client';
// 게시판 비밀번호 (사용자 요청) — 잠긴 게시판의 글 본문·이미지·대표 사진을 프롬프트 게시판 비밀번호의 콘텐츠 키로 봉한다.
// 게시판 잠금을 풀면 그 잠금으로 봉했던 글(boardSealed)만 다시 푼다 — 글마다 직접 건 잠금은 그대로 둔다.
import type { Post } from './postStore';
import { sealBody, openBody } from './promptStore';

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
