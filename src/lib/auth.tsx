'use client';
// 인증 컨텍스트 (v2.0) — 백엔드 어댑터(Supabase / Firebase)에 위임한다.
// 백엔드 설정이 없으면(개발·오프라인) 브라우저 안의 로컬 계정으로 동작한다.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { backend, isServerMode } from './backend';
import { setCurrentUserId } from './currentUser';
import { getSetting, setSetting } from './settingStore';

export type Role = 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  nickname: string;
  role: Role;
  avatarUrl?: string;    // 프로필 이미지 (파일 참조 또는 URL)
  avatarColor?: string;  // 단색 아바타 (이미지 없을 때)
  email?: string;
  pending?: boolean;     // 가입 승인 대기 (사용자 요청)
  twitter?: string;      // 가입할 때 적은 트위터 아이디
}

type Result = { ok: boolean; error?: string };

/* ---------- 트위터 아이디로 가입 (사용자 요청 — 이메일 대신) ----------
   로그인 서비스(Supabase)는 이메일 모양의 아이디가 필요해서, 트위터 아이디를 이 홈 전용
   가짜 주소(받는 곳이 없는 주소)로 바꿔 쓴다. 메일은 보내지 않는다 — 대신 관리자가 승인한다.
   예전부터 이메일로 가입한 계정은 그대로 이메일로 로그인한다. */
const TW_DOMAIN = 'x.ohome.invalid';
/** @ 떼고, 대소문자 무시 */
export const normHandle = (s: string) => s.trim().replace(/^@+/, '').toLowerCase();
export const validHandle = (s: string) => /^[a-z0-9_]{1,30}$/.test(normHandle(s));
/** 로그인 칸에 적은 값 → 실제 로그인 주소 (이메일이면 그대로) */
export const loginEmailOf = (id: string) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id.trim()) ? id.trim() : `${normHandle(id)}@${TW_DOMAIN}`);
/** 이 홈 전용 주소에서 트위터 아이디만 */
export const handleOfEmail = (email?: string) => (email && email.endsWith(`@${TW_DOMAIN}`) ? email.slice(0, -TW_DOMAIN.length - 1) : undefined);
const PENDING_MSG = '관리자 승인을 기다리고 있어요 — 승인되면 로그인할 수 있어요.';

interface AuthCtx {
  user: User | null;          // null = 비로그인
  isAdmin: boolean;
  login: (id: string, password: string) => Promise<Result>;
  /** id = 트위터 아이디. 가입하면 승인 대기 상태가 되고 로그인되지 않는다 */
  signup: (id: string, password: string, nickname: string, inviteCode: string) => Promise<Result>;
  findId: (email: string) => Promise<Result & { foundId?: string }>;
  resetPassword: (email: string) => Promise<Result & { tempPassword?: string }>;
  logout: () => Promise<void>;
  updateProfile: (patch: { nickname?: string; avatarUrl?: string | null; avatarColor?: string | null; currentPassword?: string; newPassword?: string }) => Promise<Result>;
  /** 서버(DB) 연결 없이 브라우저 계정으로 도는 중인지 — 개발·오프라인 */
  mock: boolean;
  /** 누가 보고 있는지 확인이 끝났는지 (v2.0) — 처음 한 박자는 늘 「비로그인」으로 보인다.
   *  그 사이에 권한을 판정하면 관리자에게도 「비공개」 화면이 번쩍인다. */
  ready: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const MOCK_KEY = 'ohome.mockuser.v1';
const MOCK_REG_KEY = 'ohome.mockreg.v1';
const INVITE_KEY = 'ohome.invite.v1';    // 가입코드 — 환경설정 > 회원/보안
const SETUP_KEY = 'ohome.setup.v1';      // 설치 화면을 마쳤는지

/** 현재 가입코드 — 관리자가 정한 값(서버 공유), 없으면 기본 WELCOME */
export function inviteCode(): string {
  return getSetting<string>(INVITE_KEY, 'WELCOME') || 'WELCOME';
}
export function setInviteCode(code: string) {
  setSetting(INVITE_KEY, code.trim());
}

export function isSetupDone(): boolean {
  try { return !!localStorage.getItem(SETUP_KEY); } catch { return false; }
}
export function markSetupDone() {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify({ done: true, at: new Date().toISOString() })); } catch { /* 무시 */ }
}

/* ---------- 로컬 계정 (백엔드 없이 개발할 때) ---------- */

const MOCK_ACCOUNTS: Record<string, { password: string; user: User }> = {
  admin: { password: '0000', user: { id: 'admin', nickname: '관리자', role: 'admin' } },
  guest: { password: '0000', user: { id: 'guest', nickname: '지인회원', role: 'member' } },
};

function mockRegistry(): Record<string, { password: string; user: User }> {
  try { return JSON.parse(localStorage.getItem(MOCK_REG_KEY) ?? '{}'); } catch { return {}; }
}

/** 로컬 계정 가입 수락·거절 (관리자) */
export function mockApprove(id: string) {
  const reg = mockRegistry();
  if (!reg[id]) return;
  reg[id] = { ...reg[id], user: { ...reg[id].user, pending: false } };
  try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 무시 */ }
}
export function mockReject(id: string) {
  const reg = mockRegistry();
  delete reg[id];
  try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 무시 */ }
}

/** 회원 프로필 조회 (관리자 회원 상세) — 로컬 모드에서만 의미가 있다 */
export function mockMemberInfo(id: string): User | null {
  const hit = mockRegistry()[id]?.user ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[id]?.user);
  return hit ? { ...hit } : null;
}

export interface SetupInput {
  adminId: string; adminPw: string; adminNick?: string;
  guestPw?: string;
}

/** 로컬 계정 설치 (백엔드 없이 쓸 때) */
export function completeSetup(v: SetupInput): { ok: boolean; error?: string } {
  const id = v.adminId.trim();
  if (!id || !v.adminPw) return { ok: false, error: '관리자 아이디와 비밀번호를 입력해 주세요.' };
  try {
    const reg = mockRegistry();
    reg[id] = { password: v.adminPw, user: { id, nickname: v.adminNick?.trim() || '관리자', role: 'admin' } };
    if (v.guestPw?.trim()) {
      reg.guest = { password: v.guestPw.trim(), user: { id: 'guest', nickname: '게스트', role: 'member' } };
    }
    localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg));
    markSetupDone();
    return { ok: true };
  } catch { return { ok: false, error: '설정을 저장하지 못했습니다.' }; }
}

/* ---------- 컨텍스트 ---------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const server = isServerMode();
  const be = backend();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);   // 확인이 끝났는지 (v2.0)

  useEffect(() => {
    if (!server || !be) {
      try {
        const raw = localStorage.getItem(MOCK_KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch { /* 무시 */ }
      setReady(true);
      return;
    }
    let alive = true;
    // 승인 대기 계정은 로그인 상태로 두지 않는다 (사용자 요청)
    const take = (u: User | null) => {
      if (!alive) return;
      if (u?.pending) { setUser(null); setReady(true); void be.signOut(); return; }
      setUser(u); setReady(true);
    };
    void be.currentUser().then(u => take(u as User | null));
    const off = be.onAuthChange(u => take(u as User | null));
    return () => { alive = false; off(); };
  }, [server, be]);

  const login = useCallback(async (id: string, password: string): Promise<Result> => {
    if (server && be) {
      const r = await be.signIn(loginEmailOf(id), password);
      if (!r.ok) {
        return { ok: false, error: /invalid login|credentials/i.test(r.error ?? '') ? '아이디 또는 비밀번호가 올바르지 않습니다.' : (r.error ?? '로그인에 실패했습니다.') };
      }
      const u = await be.currentUser();
      if (u?.pending) { await be.signOut(); setUser(null); return { ok: false, error: PENDING_MSG }; }
      return { ok: true };
    }
    const key = mockRegistry()[id] ? id : normHandle(id);
    const acc = mockRegistry()[key] ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[id]);
    if (!acc || acc.password !== password) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    if (acc.user.pending) return { ok: false, error: PENDING_MSG };
    setUser(acc.user);
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(acc.user)); } catch { /* 무시 */ }
    return { ok: true };
  }, [server, be]);

  // 회원가입 — 가입코드(초대코드) + 트위터 아이디, 관리자 승인 후 완료 (사용자 요청)
  const signup = useCallback(async (handle: string, password: string, nickname: string, code: string): Promise<Result> => {
    const id = normHandle(handle);
    if (!id || !password || !nickname) return { ok: false, error: '트위터 아이디·비밀번호·닉네임을 모두 입력해 주세요.' };
    if (!validHandle(id)) return { ok: false, error: '트위터 아이디는 영문·숫자·밑줄(_)만 쓸 수 있어요.' };
    if (server && be) {
      // 서버 모드 — 가입코드는 서버가 검사한다 (방문자 화면에는 코드가 내려오지 않는다)
      const r = await be.signUp(loginEmailOf(id), password, nickname.trim(), code.trim(), { twitter: id });
      if (!r.ok) {
        const e = r.error ?? '';
        if (/already registered|already exists/i.test(e)) return { ok: false, error: '이미 가입 신청한 트위터 아이디입니다.' };
        if (/password/i.test(e) && /least|short|6/i.test(e)) return { ok: false, error: '비밀번호는 6자 이상이어야 합니다.' };
        return { ok: false, error: e || '가입에 실패했습니다.' };
      }
      // 계정이 만들어지며 바로 로그인될 수 있다 — 승인 전이므로 로그아웃해 둔다
      try { await be.signOut(); } catch { /* 무시 */ }
      setUser(null);
      return { ok: true };
    }
    if (code !== inviteCode()) return { ok: false, error: '가입코드가 올바르지 않습니다.' };
    if (MOCK_ACCOUNTS[id] || mockRegistry()[id]) return { ok: false, error: '이미 사용 중인 아이디입니다.' };
    const reg = mockRegistry();
    reg[id] = { password, user: { id, nickname, role: 'member', pending: true, twitter: id } };
    try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 무시 */ }
    return { ok: true };
  }, [server, be]);

  const findId = useCallback(async (email: string): Promise<Result & { foundId?: string }> => {
    if (!email.trim()) return { ok: false, error: '이메일을 입력해 주세요.' };
    if (server) return { ok: false, error: '이메일이 곧 아이디입니다 — 그대로 로그인해 주세요.' };
    const hit = Object.values(mockRegistry()).find(a => a.user.email?.toLowerCase() === email.trim().toLowerCase());
    return hit ? { ok: true, foundId: hit.user.id } : { ok: false, error: '이 이메일로 가입된 계정이 없습니다.' };
  }, [server]);

  const resetPassword = useCallback(async (email: string): Promise<Result & { tempPassword?: string }> => {
    if (!email.trim()) return { ok: false, error: '이메일을 입력해 주세요.' };
    if (server && be) {
      const r = await be.resetPassword(email.trim());
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const reg = mockRegistry();
    const hit = Object.entries(reg).find(([, a]) => a.user.email?.toLowerCase() === email.trim().toLowerCase());
    if (!hit) return { ok: false, error: '이 이메일로 가입된 계정이 없습니다.' };
    const temp = Math.random().toString(36).slice(2, 8);
    reg[hit[0]] = { ...hit[1], password: temp };
    try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 무시 */ }
    return { ok: true, tempPassword: temp };
  }, [server, be]);

  const updateProfile = useCallback(async (patch: {
    nickname?: string; avatarUrl?: string | null; avatarColor?: string | null; currentPassword?: string; newPassword?: string;
  }): Promise<Result> => {
    if (!user) return { ok: false, error: '로그인이 필요합니다.' };
    if (server && be) {
      const r = await be.updateProfile(patch);
      if (!r.ok) return r;
      setUser(u => (u ? {
        ...u,
        nickname: patch.nickname?.trim() || u.nickname,
        avatarUrl: patch.avatarUrl === null ? undefined : (patch.avatarUrl ?? u.avatarUrl),
        avatarColor: patch.avatarColor === null ? undefined : (patch.avatarColor ?? u.avatarColor),
      } : u));
      return { ok: true };
    }
    const reg = mockRegistry();
    const cur = reg[user.id] ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[user.id]);
    if (!cur) return { ok: false, error: '계정을 찾을 수 없습니다.' };
    if (patch.newPassword && patch.currentPassword !== cur.password) {
      return { ok: false, error: '현재 비밀번호가 올바르지 않습니다.' };
    }
    const nextUser: User = {
      ...cur.user,
      nickname: patch.nickname?.trim() || cur.user.nickname,
      avatarUrl: patch.avatarUrl === null ? undefined : (patch.avatarUrl ?? cur.user.avatarUrl),
      avatarColor: patch.avatarColor === null ? undefined : (patch.avatarColor ?? cur.user.avatarColor),
    };
    reg[user.id] = { password: patch.newPassword || cur.password, user: nextUser };
    try {
      localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg));
      localStorage.setItem(MOCK_KEY, JSON.stringify(nextUser));
    } catch { /* 무시 */ }
    setUser(nextUser);
    return { ok: true };
  }, [server, be, user]);

  const logout = useCallback(async () => {
    if (server && be) { await be.signOut(); setUser(null); return; }
    setUser(null);
    try { localStorage.removeItem(MOCK_KEY); } catch { /* 무시 */ }
  }, [server, be]);

  // 저장 계층의 현재 사용자 id는 그리는 즉시 맞춘다 — 자식 화면의 효과가 이 컴포넌트 효과보다 먼저 돌아서,
  // 로그인 직후 자식이 회원 전용 키를 찾을 때 아직 비로그인으로 보이던 문제
  setCurrentUserId(user?.id ?? null);

  // 관리자면 body.admin — 페이지 설명 편집 연필 등
  // 저장 계층이 훅 밖에서 작성자 id를 알 수 있게 함께 기록
  useEffect(() => {
    document.body.classList.toggle('admin', user?.role === 'admin');
    setCurrentUserId(user?.id ?? null);
  }, [user]);

  return (
    <Ctx.Provider value={{
      user, isAdmin: user?.role === 'admin', ready,
      login, signup, findId, resetPassword, logout, updateProfile, mock: !server,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
