'use client';
// 프롬프트 백업 (사용자 요청 — 마이페이지, 시안 A 카드형) — NovelAI 태그를 작태 · 구도 · 의상으로 나눠 모아 둔다.
//  · 분류 탭을 누르면 그 분류의 카드가 쭉 나온다 · 프롬프트 / 네거티브는 각각 옆 버튼 한 번으로 복사
//  · 카드마다 예시 그림 한 장 — 올리기 전에 메타데이터(위치·기기·생성 정보)를 지운다 (putBlob이 처리)
//  · 회원 모두가 같은 목록을 함께 본다 (사용자 요청 — 회원들과 태그 공유). 서버에는 회원 공개(member)로 저장 —
//    누구나 새로 올릴 수 있고, 고치기·삭제는 올린 사람과 관리자만 (my_prompts 표의 공통 규칙 그대로)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';

const PAGE = 3;   // 처음에 보여 줄 카드 수

export const MYPROMPT_KEY = 'ohome.myprompts.v1';
export type PromptCat = 'pose' | 'comp' | 'outfit' | 'sina' | 'young';
// 캐릭터 대신 시나네 · 영이네 (사용자 요청) — 둘은 남 | 여로 한 번 더 나눈다
const CATS: [PromptCat, string][] = [['pose', '작태'], ['comp', '구도'], ['outfit', '의상'], ['sina', '시나네'], ['young', '영이네']];
export type PromptSub = 'm' | 'f';
const SUBS: [PromptSub, string][] = [['m', '남'], ['f', '여']];
const hasSub = (c: PromptCat) => c === 'sina' || c === 'young';
/** 예전 「캐릭터」(char)로 저장한 것은 시나네로 보여 준다 */
const catOf = (p: { cat: string }): PromptCat => (p.cat === 'char' ? 'sina' : (p.cat as PromptCat));
const subOf = (p: { sub?: PromptSub }): PromptSub => p.sub ?? 'm';

export interface MyPrompt {
  id: string;
  authorId: string;
  visibility: 'member' | 'private';   // 예전(나만 보기) 저장분은 private — 올린 사람이 열면 member로 바꾼다
  authorName?: string;    // 올린 사람 닉네임 (올릴 때 그대로)
  cat: PromptCat;
  sub?: PromptSub;        // 시나네·영이네의 남 | 여
  title: string;
  prompt: string;
  negative: string;
  memo: string;
  img: string | null;     // 예시 그림 (blob id 또는 주소)
  date: string;           // 마지막으로 고친 때 ISO
}

/** 주소용으로 바뀐 글(%20 · %3A …)을 되돌린다 — NovelAI 등에서 복사하면 이렇게 붙을 때가 있다 (사용자 제보).
 *  그런 표시가 있을 때만, 되돌리다 실패하면 그대로 */
export function fixEncoded(t: string): string {
  if (!/%(20|2C|3A|28|29|7B|7D|5B|5D|3B|2F|22|27|25)/i.test(t)) return t;
  try { return decodeURIComponent(t); } catch {
    // 낱개 %가 섞여 있으면 알려진 것만 바꾼다
    return t.replace(/%([0-9A-Fa-f]{2})/g, (m, h: string) => { const c = String.fromCharCode(parseInt(h, 16)); return /[\x20-\x7e]/.test(c) ? c : m; });
  }
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function CopyBtn({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t); }, [done]);
  return (
    <button type="button" className={`pb-copy ${done ? 'done' : ''}`} aria-label={`${label} 복사`}
      onClick={async () => { if (await copyText(text)) { setDone(true); toast(`${label}를 복사했어요`); } else toast('복사하지 못했어요 — 길게 눌러 직접 복사해 주세요'); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {done ? <path d="M5 12.5l4.5 4.5L19 7.5" />
          : <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" /></>}
      </svg>
      <span>{done ? '복사됨' : '복사'}</span>
    </button>
  );
}

/** 태그 글을 보기 좋게 — 쉼표는 흐리게, 가중치(0.7:: … ::)와 {강조}·[약화]는 색으로 */
function Tags({ text }: { text: string }) {
  const parts = text.split(/(,\s*)/);
  return (
    <>
      {parts.map((t, i) => {
        if (/^,\s*$/.test(t)) return <span key={i} className="pb-sep">, </span>;
        const pieces = t.split(/(-?\d+(?:\.\d+)?::|::|[{}[\]]+|^artist:|^rating:)/);
        return (
          <span key={i} className="pb-tag">
            {pieces.map((x, k) => {
              if (!x) return null;
              if (/^-\d/.test(x)) return <b key={k} className="pb-w neg">{x}</b>;
              if (/^\d.*::$|^::$/.test(x)) return <b key={k} className="pb-w">{x}</b>;
              if (/^[{}[\]]+$/.test(x)) return <b key={k} className={x.includes('[') || x.includes(']') ? 'pb-br dn' : 'pb-br'}>{x}</b>;
              if (/^(artist|rating):$/.test(x)) return <i key={k} className="pb-pre">{x}</i>;
              return x;
            })}
          </span>
        );
      })}
    </>
  );
}

/** 긴 프롬프트는 네 줄까지만 — 눌러서 펼친다 */
function PromptBlock({ label, text, neg }: { label: string; text: string; neg?: boolean }) {
  const [open, setOpen] = useState(false);
  const n = text.split(',').map(t => t.trim()).filter(Boolean).length;
  const long = text.length > 180;
  return (
    <div className={`pb-block ${neg ? 'neg' : ''}`}>
      <div className="pb-lbl">
        <span>{label}</span><small>태그 {n}개</small>
        <CopyBtn text={text} label={neg ? '네거티브' : '프롬프트'} />
      </div>
      <div className={`pb-txt ${long && !open ? 'clamp' : ''}`}><Tags text={text} /></div>
      {long && <button type="button" className="pb-more" onClick={() => setOpen(v => !v)}>{open ? '접기' : '전체 보기'}</button>}
    </div>
  );
}

/** 예시 그림 — 누르면 태그가 펼쳐지고(사용자 요청), 오른쪽 위 작은 버튼으로 크게 본다 */
function Thumb({ src, open, onToggle, onZoom }: { src: string; open: boolean; onToggle: () => void; onZoom: () => void }) {
  const url = useBlobUrl(src);
  return (
    <div className={`pb-img ${open ? 'open' : ''}`}>
      <button type="button" className="pb-img-btn" onClick={onToggle} aria-expanded={open}
        aria-label={open ? '태그 접기' : '눌러서 태그 보기'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" /> : <span />}
        {open && <span className="pb-img-hint">접기 ▲</span>}
      </button>
      <button type="button" className="pb-zoom" onClick={onZoom} aria-label="예시 그림 크게 보기" data-tip="크게 보기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6" /></svg>
      </button>
    </div>
  );
}

export const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const EMPTY = { cat: 'pose' as PromptCat, sub: 'm' as PromptSub, title: '', prompt: '', negative: '', memo: '', img: null as string | null };

export function PromptBackup() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [all, setAll, loaded] = useLocalList<MyPrompt>(MYPROMPT_KEY, []);
  // 모두 같은 목록 — 최근에 고친 것이 위로
  // 같은 표에 OOC 백업(kind 'ooc')도 들어 있다 — 여기선 프롬프트만
  const mine = useMemo(() => all.filter(p => (p as { kind?: string }).kind !== 'ooc')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [all]);
  const canEdit = (p: MyPrompt) => isAdmin || p.authorId === user?.id;
  // 나만 보기로 저장했던 내 것은 함께 보이게 바꿔 둔다 (한 번)
  const fixed = useRef(false);
  useEffect(() => {
    if (!loaded || fixed.current || !user) return;
    fixed.current = true;
    if (all.some(p => p.authorId === user.id && p.visibility !== 'member')) {   // OOC는 늘 member라 걸리지 않는다
      setAll(all.map(p => (p.authorId === user.id && p.visibility !== 'member' ? { ...p, visibility: 'member' as const, authorName: p.authorName ?? user.nickname } : p)));
    }
  }, [loaded, all, user, setAll]);
  const [cat, setCat] = useState<PromptCat>('pose');
  const [sub, setSub] = useState<PromptSub>('m');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [cat, sub, q]);   // 탭·찾기를 바꾸면 처음 몇 개만 다시
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());   // 그림을 눌러 태그를 펼친 카드
  const toggleOpen = (id: string) => setOpenIds(s0 => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [del, setDel] = useState<MyPrompt | null>(null);
  const picRef = useRef<HTMLInputElement>(null);

  const count = (c: PromptCat) => mine.filter(p => catOf(p) === c).length;
  const subCount = (x: PromptSub) => mine.filter(p => catOf(p) === cat && subOf(p) === x).length;
  const shown = mine.filter(p => catOf(p) === cat && (!hasSub(cat) || subOf(p) === sub) && (!q.trim()
    || [p.title, fixEncoded(p.prompt), fixEncoded(p.negative), p.memo].join('\n').toLowerCase().includes(q.trim().toLowerCase())));

  const pickImg = async (f?: File) => {
    if (!f || !edit) return;
    setUpBusy(true);
    try {
      const id = await putBlob(f);   // 메타데이터를 지운 뒤 올린다
      setEdit(e => (e ? { ...e, img: id } : e));
    } catch (e) {
      toast(`그림을 올리지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setUpBusy(false);
  };

  const save = () => {
    if (!edit || !user) return;
    if (!edit.title.trim() && !edit.prompt.trim()) { toast('제목이나 프롬프트를 적어 주세요'); return; }
    const now = new Date().toISOString();
    const prev = edit.id ? all.find(p => p.id === edit.id) : undefined;
    const item: MyPrompt = {
      // 관리자가 남의 것을 고쳐도 올린 사람은 그대로
      id: edit.id ?? newId(), authorId: prev?.authorId ?? user.id, authorName: prev?.authorName ?? user.nickname, visibility: 'member',
      cat: edit.cat, ...(hasSub(edit.cat) ? { sub: edit.sub } : {}), title: edit.title.trim() || '제목 없음', prompt: edit.prompt.trim(), negative: edit.negative.trim(),
      memo: edit.memo.trim(), img: edit.img, date: now,
    };
    setAll(edit.id ? all.map(p => (p.id === edit.id ? item : p)) : [item, ...all]);
    setCat(item.cat);
    if (item.sub) setSub(item.sub);
    setEdit(null);
    toast(edit.id ? '고쳤어요' : '저장했어요');
  };

  return (
    <div className="panel" style={{ padding: 24 }}>
      <div className="pb-head">
        <h4>PROMPT BACKUP</h4>
        <button type="button" className="btn btn-dark pb-add" onClick={() => setEdit({ ...EMPTY, cat, sub })}>＋ 새 프롬프트</button>
      </div>
      <div className="pb-tabs tight" role="tablist">
        {CATS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
            {l}<i>{count(k)}</i>
          </button>
        ))}
      </div>
      {hasSub(cat) && (
        <div className="pb-subtabs" role="tablist" aria-label="남 · 여">
          {SUBS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={sub === k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>
              {l}<i>{subCount(k)}</i>
            </button>
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <input className="pb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·태그로 찾기" aria-label="프롬프트 찾기" />
      )}

      <div className="pb-list">
        {shown.length === 0 && (
          <p className="hint pb-empty">{q ? '찾는 프롬프트가 없어요' : `아직 ${CATS.find(c => c[0] === cat)![1]}${hasSub(cat) ? ` ${SUBS.find(x => x[0] === sub)![1]}` : ''} 프롬프트가 없어요 — ＋ 새 프롬프트로 백업해 보세요`}</p>
        )}
        {shown.slice(0, limit).map(p => (
          // 그림 있는 카드는 세로 미리보기로 한 줄에 셋 (사용자 요청) — 눌러 펼치면 한 줄을 다 쓴다
          <div key={p.id} className={`pb-card ${p.img ? 'thumb' : ''} ${p.img && (openIds.has(p.id) || q.trim()) ? 'open' : ''}`}>
            <div className="pb-top">
              <b>{p.title}</b>
              {canEdit(p) && (<>
                <button type="button" className="pb-mini" onClick={() => setEdit({ id: p.id, cat: catOf(p), sub: subOf(p), title: p.title, prompt: fixEncoded(p.prompt), negative: fixEncoded(p.negative), memo: p.memo, img: p.img })}>고치기</button>
                <button type="button" className="pb-mini danger" onClick={() => setDel(p)}>삭제</button>
              </>)}
            </div>
            <div className="pb-body">
              {p.img && <Thumb src={p.img} open={openIds.has(p.id)} onToggle={() => toggleOpen(p.id)} onZoom={() => setView(p.img)} />}
              {/* 그림이 있으면 그림을 눌러야 태그가 보인다 — 그림이 없으면 바로 */}
              {(!p.img || openIds.has(p.id) || !!q.trim()) && (
                <div className="pb-texts">
                  {p.prompt && <PromptBlock label="PROMPT" text={fixEncoded(p.prompt)} />}
                  {p.negative && <PromptBlock label="NEGATIVE" text={fixEncoded(p.negative)} neg />}
                </div>
              )}
            </div>
            <div className="pb-foot">{p.authorName ? `${p.authorName} · ` : ''}{fmt(p.date)}{p.memo ? ` · 메모: ${p.memo}` : ''}</div>
          </div>
        ))}
        {/* 많이 쌓여도 마이페이지가 너무 길어지지 않게 — 몇 개씩만 (사용자 요청) */}
        {shown.length > PAGE && (
          <div className="pb-pager">
            {limit < shown.length
              ? <button type="button" onClick={() => setLimit(l => l + PAGE)}>더 보기 <i>{shown.length - limit}개 더</i></button>
              : <button type="button" onClick={() => setLimit(PAGE)}>접기 ▲</button>}
          </div>
        )}
      </div>

      {/* 새로 / 고치기 */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '프롬프트 고치기' : '새 프롬프트'} dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEdit(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={save} disabled={upBusy}>SAVE</button>
        </>}>
        {edit && (
          <div className="pb-form">
            <div className="mini-seg">
              {CATS.map(([k, l]) => <button key={k} type="button" className={edit.cat === k ? 'on' : ''} onClick={() => setEdit({ ...edit, cat: k })}>{l}</button>)}
            </div>
            {hasSub(edit.cat) && (
              <div className="mini-seg">
                {SUBS.map(([k, l]) => <button key={k} type="button" className={edit.sub === k ? 'on' : ''} onClick={() => setEdit({ ...edit, sub: k })}>{l}</button>)}
              </div>
            )}
            <KInput value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="제목 (예: 앉아서 턱 괴기)" maxLength={60} />
            <label className="pb-flabel">PROMPT</label>
            <KTextarea value={edit.prompt} onChange={e => setEdit({ ...edit, prompt: fixEncoded(e.target.value) })} spellCheck={false}
              placeholder="1boy, sitting, chin rest, looking at viewer, ..." style={{ minHeight: 90, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5 }} />
            <label className="pb-flabel">NEGATIVE <small>(없으면 비워 두세요)</small></label>
            <KTextarea value={edit.negative} onChange={e => setEdit({ ...edit, negative: fixEncoded(e.target.value) })} spellCheck={false}
              placeholder="lowres, bad anatomy, ..." style={{ minHeight: 56, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5 }} />
            <KInput value={edit.memo} onChange={e => setEdit({ ...edit, memo: e.target.value })} placeholder="메모 (선택)" maxLength={120} />
            <label className="pb-flabel">예시 그림 <small>(올릴 때 위치·기기·생성 정보 같은 메타데이터는 지워져요)</small></label>
            <div className="pb-pic">
              {edit.img ? <PicPreview src={edit.img} /> : <span className="pb-pic-empty">없음</span>}
              <button type="button" className="btn btn-ghost" disabled={upBusy} onClick={() => picRef.current?.click()}>
                {upBusy ? '올리는 중…' : edit.img ? '바꾸기' : '그림 고르기'}
              </button>
              {edit.img && <button type="button" className="btn btn-ghost" onClick={() => setEdit({ ...edit, img: null })}>빼기</button>}
              <input ref={picRef} type="file" accept="image/*" hidden onChange={e => { void pickImg(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} small title="프롬프트 삭제"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setDel(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => { if (del) { setAll(all.filter(p => p.id !== del.id)); toast('삭제했어요'); } setDel(null); }}>DELETE</button>
        </>}>
        <p style={{ margin: 0 }}>「{del?.title}」을(를) 지울까요? 되돌릴 수 없어요.</p>
      </Modal>

      {view && <Lightbox srcs={[view]} index={0} onClose={() => setView(null)} />}
    </div>
  );
}

function PicPreview({ src }: { src: string }) {
  const url = useBlobUrl(src);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="pb-pic-img" src={url} alt="" /> : <span className="pb-pic-empty">…</span>;
}
