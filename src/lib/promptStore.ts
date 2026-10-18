'use client';
/**
 * 프롬프트 게시판 (사용자 요청) — 캐릭터 하나 = 글 하나, 글 안에 복장별 탭(인덱스).
 * 탭마다 이미지 한 장 + 프롬프트 한 덩어리. 글 테이블을 새로 만들지 않고(포크가 SQL을 다시 돌릴 일 없게)
 * 인포·소개처럼 설정 한 칸에 담아 서버에 동기화한다.
 *
 * 게시판 비밀번호 (사용자 요청) — 화면만 가리면 서버의 설정값을 직접 열어 보는 사람에게는 그대로 보인다.
 * 그래서 비밀번호를 걸면 **글 목록 전체를 그 비밀번호로 암호화해서** 저장한다 (PBKDF2 → AES-GCM).
 * 비밀번호를 모르면 관리자도 못 연다 — 잊으면 되돌릴 방법이 없다.
 * 공지는 잠금 화면에도 보여야 하므로 암호화하지 않는다.
 * 이미지 주소 목록(imgs)은 따로 평문으로 둔다 — 「안 쓰는 이미지 정리」가 암호문 속 주소를 못 읽어
 * 글에 쓰인 이미지를 지워 버리지 않게.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';
import { newId } from './postStore';

const KEY = 'ohome.prompt.v1';

export interface PromptTab { id: string; name: string; img: string | null; prompt: string }
export interface PromptPost { id: string; title: string; tabs: PromptTab[]; date: string }

export const newTab = (name = ''): PromptTab => ({ id: newId(), name, img: null, prompt: '' });
export const newPromptPost = (): PromptPost => ({ id: newId(), title: '', tabs: [newTab('기본')], date: new Date().toISOString() });

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const DEFAULT_PROMPT_NOTICE = '모든 프롬프트 타인에게 전달 금지\n가중치 및 의상 수정 가능';

interface Lock { salt: string; iv: string; data: string; imgs: string[] }
interface Stored { notice?: string; posts?: unknown; lock?: Lock; ordered?: boolean }

/** 처음 한 번 맞춰 둘 글 순서 (사용자 요청) — 관리자가 순서를 한 번이라도 저장하면(ordered) 그 순서를 따른다 */
const PREFERRED_ORDER = ['도브', '시오', '지선우', '춘열망'];
function preferredSort(list: PromptPost[]): PromptPost[] {
  const rank = (p: PromptPost) => { const i = PREFERRED_ORDER.indexOf(p.title.trim()); return i < 0 ? PREFERRED_ORDER.length : i; };
  return list.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
}

function normPosts(list: unknown): PromptPost[] {
  return (Array.isArray(list) ? list : []).map(p => {
    const o = (p ?? {}) as Record<string, unknown>;
    const tabs = (Array.isArray(o.tabs) ? o.tabs : []).map(t => {
      const q = (t ?? {}) as Record<string, unknown>;
      return { id: str(q.id) || newId(), name: str(q.name), img: typeof q.img === 'string' ? q.img : null, prompt: str(q.prompt) };
    });
    return { id: str(o.id) || newId(), title: str(o.title), tabs: tabs.length ? tabs : [newTab('기본')], date: str(o.date) || new Date().toISOString() };
  });
}

/* ---------- 암호화 ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const SESSION_KEY = 'ohome.prompt.unlock';   // 이 탭에서 한 번 열면 새로고침해도 다시 묻지 않게 (탭을 닫으면 사라짐)
/* 관리자는 비밀번호를 걸어도 그냥 들어가게 (사용자 요청) — 관리자가 이 기기에서 한 번 열거나 비밀번호를 걸면
   키를 이 기기에 남겨 두고, 관리자로 로그인해 있을 때만 그 키로 바로 연다. 서버로는 올라가지 않는다(설정 키 목록 밖) */
const ADMIN_KEY = 'ohome.prompt.adminkey';

async function deriveKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 200000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function seal(key: CryptoKey, salt: string, posts: PromptPost[]): Promise<Lock> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(JSON.stringify(posts)));
  const imgs = posts.flatMap(p => p.tabs.map(t => t.img)).filter((v): v is string => !!v);
  return { salt, iv: toB64(iv), data: toB64(data), imgs };
}
async function open(key: CryptoKey, lock: Lock): Promise<PromptPost[]> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(lock.iv) as BufferSource }, key, fromB64(lock.data) as BufferSource);
  return normPosts(JSON.parse(dec.decode(plain)));
}
async function rememberKey(key: CryptoKey, salt: string, admin: boolean) {
  try {
    const v = JSON.stringify({ salt, k: toB64(await crypto.subtle.exportKey('raw', key)) });
    sessionStorage.setItem(SESSION_KEY, v);
    if (admin) localStorage.setItem(ADMIN_KEY, v);
  } catch { /* 무시 */ }
}
async function recallKey(salt: string, admin: boolean): Promise<CryptoKey | null> {
  try {
    const r = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? (admin ? localStorage.getItem(ADMIN_KEY) : null) ?? 'null');
    if (!r || r.salt !== salt) return null;
    return await crypto.subtle.importKey('raw', fromB64(r.k) as BufferSource, 'AES-GCM', true, ['encrypt', 'decrypt']);
  } catch { return null; }
}

export interface PromptBoard {
  loaded: boolean;
  notice: string;
  setNotice: (s: string) => void;
  /** 비밀번호가 걸려 있는가 */
  locked: boolean;
  /** 걸려 있는데 아직 못 열었는가 — 이때 posts는 빈 배열 */
  sealed: boolean;
  posts: PromptPost[];
  savePosts: (next: PromptPost[]) => void;
  unlock: (pw: string) => Promise<boolean>;
  /** 비밀번호 걸기·바꾸기(문자열) / 풀기(null) — 열린 상태에서만 */
  setPassword: (pw: string | null) => Promise<void>;
}

export function usePromptBoard(isAdmin = false): PromptBoard {
  const [loaded, setLoaded] = useState(false);
  const [notice, setNoticeS] = useState(DEFAULT_PROMPT_NOTICE);
  const [lock, setLock] = useState<Lock | null>(null);
  const [posts, setPosts] = useState<PromptPost[]>([]);
  const [sealed, setSealed] = useState(false);
  const keyRef = useRef<CryptoKey | null>(null);
  // 저장은 항상 최신 값을 모아서 — 공지·글·잠금을 한 칸에 같이 쓴다
  const cur = useRef<{ notice: string; posts: PromptPost[]; lock: Lock | null; ordered: boolean }>({ notice: DEFAULT_PROMPT_NOTICE, posts: [], lock: null, ordered: false });
  const adminRef = useRef(isAdmin);
  adminRef.current = isAdmin;
  const arrange = (list: PromptPost[]) => (cur.current.ordered ? list : preferredSort(list));

  useEffect(() => {
    let alive = true;
    (async () => {
      let st: Stored = {};
      try { const raw = getRawSetting(KEY); if (raw) st = JSON.parse(raw) ?? {}; } catch { /* 기본값 */ }
      const n = typeof st.notice === 'string' ? st.notice : DEFAULT_PROMPT_NOTICE;
      const lk = st.lock && typeof st.lock.data === 'string' ? st.lock : null;
      cur.current.ordered = st.ordered === true;
      let list: PromptPost[] = [], isSealed = false;
      if (lk) {
        const key = await recallKey(lk.salt, adminRef.current);
        if (key) {
          try { list = await open(key, lk); keyRef.current = key; } catch { isSealed = true; }
        } else isSealed = true;
      } else list = normPosts(st.posts);
      if (!alive) return;
      list = arrange(list);
      cur.current = { ...cur.current, notice: n, posts: list, lock: lk };
      setNoticeS(n); setLock(lk); setPosts(list); setSealed(isSealed); setLoaded(true);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 로그인 확인이 늦게 끝나 관리자로 판정되면, 이 기기에 남겨 둔 키로 바로 연다
  useEffect(() => {
    if (!isAdmin || !loaded || !sealed) return;
    const lk = cur.current.lock;
    if (!lk) return;
    let alive = true;
    (async () => {
      const key = await recallKey(lk.salt, true);
      if (!key) return;
      try {
        const list = arrange(await open(key, lk));
        if (!alive) return;
        keyRef.current = key;
        cur.current = { ...cur.current, posts: list };
        setPosts(list); setSealed(false);
      } catch { /* 옛 키 — 비밀번호를 넣어야 한다 */ }
    })();
    return () => { alive = false; };
  }, [isAdmin, loaded, sealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const write = useCallback((c: { notice: string; posts: PromptPost[]; lock: Lock | null; ordered: boolean }) => {
    cur.current = c;
    const out: Stored = c.lock ? { notice: c.notice, lock: c.lock } : { notice: c.notice, posts: c.posts };
    if (c.ordered) out.ordered = true;
    try { setSetting(KEY, out); } catch { /* 무시 */ }
  }, []);

  const setNotice = useCallback((s: string) => {
    setNoticeS(s);
    write({ ...cur.current, notice: s });
  }, [write]);

  const savePosts = useCallback((next: PromptPost[]) => {
    setPosts(next);
    const c = { ...cur.current, ordered: true };   // 글을 저장하면 지금 보이는 순서가 곧 정해진 순서
    if (c.lock && keyRef.current) {
      const key = keyRef.current, salt = c.lock.salt;
      cur.current = { ...c, posts: next };
      void seal(key, salt, next).then(lk => { setLock(lk); write({ ...cur.current, lock: lk }); });
    } else if (!c.lock) write({ ...c, posts: next });
  }, [write]);

  const unlock = useCallback(async (pw: string) => {
    const lk = cur.current.lock;
    if (!lk) return true;
    try {
      const key = await deriveKey(pw, fromB64(lk.salt));
      const list = arrange(await open(key, lk));
      keyRef.current = key;
      await rememberKey(key, lk.salt, adminRef.current);
      cur.current = { ...cur.current, posts: list };
      setPosts(list); setSealed(false);
      return true;
    } catch { return false; }
  }, []);

  const setPassword = useCallback(async (pw: string | null) => {
    const c = cur.current;
    if (c.lock && !keyRef.current) throw new Error('먼저 잠금을 풀어 주세요');
    if (pw === null) {
      keyRef.current = null;
      try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(ADMIN_KEY); } catch { /* 무시 */ }
      setLock(null);
      write({ notice: c.notice, posts: c.posts, lock: null, ordered: true });
      return;
    }
    const saltB = crypto.getRandomValues(new Uint8Array(16));
    const salt = toB64(saltB);
    const key = await deriveKey(pw, saltB);
    const lk = await seal(key, salt, c.posts);
    keyRef.current = key;
    await rememberKey(key, salt, adminRef.current);
    setLock(lk);
    write({ notice: c.notice, posts: c.posts, lock: lk, ordered: true });
  }, [write]);

  return { loaded, notice, setNotice, locked: !!lock, sealed, posts, savePosts, unlock, setPassword };
}
