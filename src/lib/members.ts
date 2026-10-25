'use client';
// 회원 목록 (v2.0) — 서버 모드면 DB의 회원 프로필, 아니면 브라우저 계정
// 가입 승인 대기 회원(사용자 요청)은 기본 목록에서 빠지고, 관리자 승인 화면에서만 따로 본다
import { useCallback, useEffect, useState } from 'react';
import { backend, isServerMode } from './backend';

export interface MemberLite {
  id: string; nickname: string; role?: 'admin' | 'member';
  pending?: boolean; twitter?: string; createdAt?: string;
}

/** 로컬(브라우저) 계정 목록 — 서버 없이 개발할 때 */
export function memberPool(): MemberLite[] {
  const base: MemberLite[] = [
    { id: 'admin', nickname: '관리자' },
    { id: 'guest', nickname: '지인회원' },
  ];
  try {
    const reg = JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as
      Record<string, { user?: MemberLite }>;
    for (const k of Object.keys(reg)) {
      const u = reg[k]?.user;
      if (u && !base.some(b => b.id === u.id)) base.push({ id: u.id, nickname: u.nickname, pending: u.pending, twitter: u.twitter });
    }
  } catch { /* 무시 */ }
  return base;
}

/** 회원 목록 + 다시 불러오기 — withPending이면 승인 대기 회원도 함께 */
export function useMemberList(withPending = false, enabled = true): [MemberLite[], () => void] {
  const [all, setAll] = useState<MemberLite[]>(() => (isServerMode() ? [] : memberPool()));
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const be = backend();
    if (!isServerMode() || !be) { setAll(memberPool()); return; }
    let alive = true;
    be.listMembers()
      .then(rows => {
        if (alive) {
          setAll(rows.map(r => ({ id: r.id, nickname: r.nickname, role: r.role, pending: r.pending, twitter: r.twitter, createdAt: r.createdAt })));
        }
      })
      .catch(() => { /* 권한·네트워크 문제면 빈 목록 */ });
    return () => { alive = false; };
  }, [ver, enabled]);
  const reload = useCallback(() => setVer(v => v + 1), []);
  return [withPending ? all : all.filter(m => !m.pending), reload];
}

/** 화면에서 쓰는 회원 목록 — 서버 모드에서는 가입 회원을 DB에서 가져온다 (승인된 회원만) */
export function useMembers(): MemberLite[] {
  return useMemberList(false)[0];
}
