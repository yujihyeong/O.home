'use client';
/**
 * 인포 페이지 (사용자 요청) — 자기소개 **템플릿 글 하나**.
 * 닉네임·아이디·공지·NG·페어 소개 2칸을 칸만 채우면 정해진 디자인으로 보인다.
 * 소개(intro)처럼 글 테이블이 아니라 설정 한 칸에 담아 서버에 동기화한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

const KEY = 'ohome.info.v1';

/** 페어 — 사진을 누르면 desc가 팝업으로 뜬다 (사용자 요청, **굵게** 가능) */
export interface InfoPair { img: string | null; name: string; desc: string }

/** ETC. — 다른 계정 (사용자 요청). 누르면 그 트위터(X) 프로필로 */
export interface InfoAcct { handle: string; desc: string }

/** LIST — 장르 | 캐릭터 (사용자 요청) */
export interface InfoListRow { genre: string; char: string }

/** PLAYING — 지금 플레이 중인 캐릭터 (사용자 요청): 제작자 아이디 · 캐릭터 이름 */
export interface InfoPlay { maker: string; char: string }

/** 「@abc」·「abc」·「https://x.com/abc」·「twitter.com/abc」 어느 모양으로 적어도 아이디만 */
export function handleOf(raw: string): string {
  const s = raw.trim();
  const m = s.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?@?([A-Za-z0-9_]+)/i);
  return (m ? m[1] : s.replace(/^@+/, '')).trim();
}
export const profileUrl = (handle: string) => `https://x.com/${encodeURIComponent(handleOf(handle))}`;

export type InfoTemplate = 'classic' | 'block';
/** 고를 수 있는 템플릿 — 편집 화면에서 고른다 (사용자 요청) */
export const INFO_TEMPLATES: { id: InfoTemplate; label: string }[] = [
  { id: 'classic', label: '기본' },
  { id: 'block', label: '카드 블록' },
];

export interface InfoDoc {
  /** 템플릿 — 같은 내용을 어느 디자인으로 보여 줄지 */
  template: InfoTemplate;
  /** 동그란 프로필 이미지 (사용자 요청) — 카드 블록 템플릿 */
  avatar: string | null;
  nick: string;
  uid: string;
  /** 아이디를 눌렀을 때 갈 주소 (사용자 요청, 비우면 링크 없음) */
  uidLink: string;
  /** INFO 칸 (카드 블록형 템플릿, 사용자 요청) */
  gender: string;
  age: string;           // INFO_AGES 중 하나 또는 ''
  couplings: string[];   // INFO_COUPLINGS 중 고른 것
  taste: string;         // INFO_TASTES 중 하나 또는 ''
  /** 주플랫폼 — 아래 목록 중 고른 것만 보인다 (사용자 요청) */
  platforms: string[];
  /** NOTICE — 줄마다 앞에 ♡ */
  notice: string;
  /** 계정 성향 — 고른 것만 보인다 */
  account: string[];
  /** LIST — 공지 밑, 접어 두는 항목 (사용자 요청). 장르 | 캐릭터 줄을 원하는 만큼 */
  list: InfoListRow[];
  /** LIST 맨 위에 따로 쓰는 글 (사용자 요청) */
  listNote: string;
  /** NG — 줄글, 줄마다 앞에 ✕ (예전에는 항목 배열이었다) */
  ng: string;
  /** DREAM — 이미지 + 커플명, 누르면 글 팝업 (예전 PAIR) */
  pairs: InfoPair[];
  plays: InfoPlay[];
  etc: InfoAcct[];
}

/** 고를 수 있는 주플랫폼 — 보여 줄 때도 이 순서 */
export const INFO_PLATFORMS = ['Caveduck', 'Rofan AI', 'Teapot', 'elyn', 'Plaitoon'];
export const INFO_AGES = ['성인', '미성년'];
export const INFO_COUPLINGS = ['HL', 'BL', 'GL', 'NCP', 'ALL'];
export const INFO_TASTES = ['ONLY', 'OPEN'];
export const INFO_ACCOUNT = ['구독', '소비', '탐라대화', 'RT/인용', '로그', '연성', 'AI이미지', '사담', '마음'];

/** 목록에 있는 것만, 목록 순서대로 (대소문자 무시 — 예전 'teapot'도 'Teapot'으로) */
const pick = (all: string[], v: unknown) => {
  const got = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.toLowerCase()) : [];
  return all.filter(a => got.includes(a.toLowerCase()));
};
const one = (all: string[], v: unknown) => (typeof v === 'string' && all.includes(v) ? v : '');

export const EMPTY_INFO: InfoDoc = {
  template: 'classic', avatar: null, nick: '', uid: '', uidLink: '', gender: '', age: '', couplings: [], taste: '',
  platforms: [], notice: '', account: [], list: [], listNote: '', ng: '',
  pairs: [{ img: null, name: '', desc: '' }, { img: null, name: '', desc: '' }],
  plays: [],
  etc: [],
};

/** 저장본이 옛 모양이거나 일부만 있어도 늘 같은 모양으로 */
export function normInfo(raw: Partial<InfoDoc> | null | undefined): InfoDoc {
  const r = raw ?? {};
  const pairs = Array.isArray(r.pairs) ? r.pairs : [];
  return {
    template: r.template === 'block' ? 'block' : 'classic',
    avatar: typeof r.avatar === 'string' ? r.avatar : null,
    nick: typeof r.nick === 'string' ? r.nick : '',
    uid: typeof r.uid === 'string' ? r.uid : '',
    uidLink: typeof r.uidLink === 'string' ? r.uidLink : '',
    gender: typeof r.gender === 'string' ? r.gender : '',
    age: one(INFO_AGES, r.age),
    couplings: pick(INFO_COUPLINGS, r.couplings),
    taste: one(INFO_TASTES, r.taste),
    platforms: pick(INFO_PLATFORMS, r.platforms),
    notice: typeof r.notice === 'string' ? r.notice : '',
    account: pick(INFO_ACCOUNT, r.account),
    listNote: typeof r.listNote === 'string' ? r.listNote : '',
    // 예전에는 글 한 칸이었다 — 줄마다 캐릭터 칸으로 옮긴다
    list: typeof r.list === 'string'
      ? (r.list as string).split('\n').map(l => l.trim()).filter(Boolean).map(char => ({ genre: '', char }))
      : (Array.isArray(r.list) ? r.list : []).map(a => ({
        genre: typeof a?.genre === 'string' ? a.genre : '',
        char: typeof a?.char === 'string' ? a.char : '',
      })),
    ng: typeof r.ng === 'string' ? r.ng
      : Array.isArray(r.ng) ? (r.ng as unknown[]).filter((x): x is string => typeof x === 'string').join('\n') : '',
    pairs: [0, 1].map(i => ({
      img: typeof pairs[i]?.img === 'string' ? pairs[i].img : null,
      name: typeof pairs[i]?.name === 'string' ? pairs[i].name : '',
      desc: typeof pairs[i]?.desc === 'string' ? pairs[i].desc : '',
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

/** 주소에 http(s)가 없으면 https:// 를 붙인다 */
export const hrefOf = (raw: string) => {
  const s = raw.trim();
  return !s ? '' : /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
};
