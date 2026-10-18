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

export interface InfoDoc {
  nick: string;
  uid: string;
  notice: string;
  ng: string[];
  pairs: InfoPair[];
}

export const EMPTY_INFO: InfoDoc = {
  nick: '', uid: '', notice: '', ng: [],
  pairs: [{ img: null, name: '' }, { img: null, name: '' }],
};

/** 저장본이 옛 모양이거나 일부만 있어도 늘 같은 모양으로 */
export function normInfo(raw: Partial<InfoDoc> | null | undefined): InfoDoc {
  const r = raw ?? {};
  const pairs = Array.isArray(r.pairs) ? r.pairs : [];
  return {
    nick: typeof r.nick === 'string' ? r.nick : '',
    uid: typeof r.uid === 'string' ? r.uid : '',
    notice: typeof r.notice === 'string' ? r.notice : '',
    ng: Array.isArray(r.ng) ? r.ng.filter(s => typeof s === 'string') : [],
    pairs: [0, 1].map(i => ({
      img: typeof pairs[i]?.img === 'string' ? pairs[i].img : null,
      name: typeof pairs[i]?.name === 'string' ? pairs[i].name : '',
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
