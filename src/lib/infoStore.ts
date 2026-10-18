'use client';
/**
 * 인포 페이지 (사용자 요청) — 자기소개 **템플릿 글 하나**.
 * 닉네임·아이디·공지·NG·페어 소개 2칸을 칸만 채우면 정해진 디자인으로 보인다.
 * 소개(intro)처럼 글 테이블이 아니라 설정 한 칸에 담아 서버에 동기화한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

const KEY = 'ohome.info.v1';

export interface InfoPair { img: string | null; name: string }

/** ETC. — 다른 계정 (사용자 요청). 누르면 그 트위터(X) 프로필로 */
export interface InfoAcct { handle: string; desc: string }

/** PLAYING — 지금 플레이 중인 캐릭터 (사용자 요청): 제작자 아이디 · 캐릭터 이름 */
export interface InfoPlay { maker: string; char: string }

/** 「@abc」·「abc」·「https://x.com/abc」·「twitter.com/abc」 어느 모양으로 적어도 아이디만 */
export function handleOf(raw: string): string {
  const s = raw.trim();
  const m = s.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?@?([A-Za-z0-9_]+)/i);
  return (m ? m[1] : s.replace(/^@+/, '')).trim();
}
export const profileUrl = (handle: string) => `https://x.com/${encodeURIComponent(handleOf(handle))}`;

export interface InfoDoc {
  nick: string;
  uid: string;
  /** 주플랫폼 — 아래 목록 중 고른 것만 보인다 (사용자 요청) */
  platforms: string[];
  notice: string;
  ng: string[];
  pairs: InfoPair[];
  plays: InfoPlay[];
  etc: InfoAcct[];
}

/** 고를 수 있는 주플랫폼 — 보여 줄 때도 이 순서 */
export const INFO_PLATFORMS = ['Caveduck', 'Rofan AI', 'teapot', 'elyn', 'Plaitoon'];

export const EMPTY_INFO: InfoDoc = {
  nick: '', uid: '', platforms: [], notice: '', ng: [],
  pairs: [{ img: null, name: '' }, { img: null, name: '' }],
  plays: [],
  etc: [],
};

/** 저장본이 옛 모양이거나 일부만 있어도 늘 같은 모양으로 */
export function normInfo(raw: Partial<InfoDoc> | null | undefined): InfoDoc {
  const r = raw ?? {};
  const pairs = Array.isArray(r.pairs) ? r.pairs : [];
  return {
    nick: typeof r.nick === 'string' ? r.nick : '',
    uid: typeof r.uid === 'string' ? r.uid : '',
    platforms: Array.isArray(r.platforms) ? INFO_PLATFORMS.filter(p => r.platforms!.includes(p)) : [],
    notice: typeof r.notice === 'string' ? r.notice : '',
    ng: Array.isArray(r.ng) ? r.ng.filter(s => typeof s === 'string') : [],
    pairs: [0, 1].map(i => ({
      img: typeof pairs[i]?.img === 'string' ? pairs[i].img : null,
      name: typeof pairs[i]?.name === 'string' ? pairs[i].name : '',
    })),
    plays: (Array.isArray(r.plays) ? r.plays : []).map(a => ({
      maker: typeof a?.maker === 'string' ? a.maker : '',
      char: typeof a?.char === 'string' ? a.char : '',
    })),
    etc: (Array.isArray(r.etc) ? r.etc : []).map(a => ({
      handle: typeof a?.handle === 'string' ? a.handle : '',
      desc: typeof a?.desc === 'string' ? a.desc : '',
    })),
  };
}

export function useInfo(): [InfoDoc, (next: InfoDoc) => void, boolean] {
  const [doc, setDoc] = useState<InfoDoc>(EMPTY_INFO);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) setDoc(normInfo(JSON.parse(raw)));
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const save = useCallback((next: InfoDoc) => {
    setDoc(next);
    try { setSetting(KEY, next); } catch { /* 무시 */ }
  }, []);
  return [doc, save, loaded];
}
