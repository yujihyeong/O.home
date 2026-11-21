'use client';
// OOC 백업 (사용자 요청 — 마이페이지, 프롬프트 백업과 같은 방식) — AI 채팅에서 쓰는 OOC를 모아 두고 회원끼리 함께 본다.
//  · 분류는 정해 둔 목록(기본: 일상 · AU · 귀여움 · 정신아픔이 · 19금)에서 고른다 — 관리자가 더하고 뺄 수 있다
//    (사이트 설정 ohome.oocCats.v1). 목록에 없는 분류로 저장된 것은 「기타」 탭에 모인다
//  · OOC 글은 옆 버튼 한 번으로 복사 · 「예시」를 누르면 그 OOC로 돌렸을 때 나온 답(글·캡처 그림)이 펼쳐진다
//  · 저장은 프롬프트 백업과 같은 표(my_prompts)에 kind 'ooc'로 — 설치 SQL을 다시 돌리지 않아도 된다.
//    회원 공개(member) · 고치기·삭제는 올린 사람과 관리자만
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, setSetting, onSettingChange } from '@/lib/settingStore';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { MYPROMPT_KEY, CopyBtn, fixEncoded, fmt } from '@/components/ui/PromptBackup';

const PAGE = 3;   // 처음에 보여 줄 카드 수

export interface OocNote {
  id: string;
  kind: 'ooc';
  authorId: string;
  authorName?: string;
  visibility: 'member';
  cat: string;           // 자유 분류 (비우면 「기타」)
  title: string;
  ooc: string;
  example: string;       // 이 OOC로 돌렸을 때 나온 답
  img: string | null;    // 예시 캡처 그림 (메타데이터 지움)
  memo: string;
  date: string;
}
const ALL = '전체';
const ETC = '기타';
const CATS_KEY = 'ohome.oocCats.v1';
const DEFAULT_CATS = ['일상', 'AU', '귀여움', '정신아픔이', '19금'];

/** 분류 목록 — 사이트 설정에서 읽고, 다른 화면에서 바꾸면 따라간다 */
function useOocCats(): [string[], (next: string[]) => void] {
  const [cats, setCats] = useState<string[]>(DEFAULT_CATS);
  useEffect(() => {
    const read = () => {
      const v = getSetting<unknown>(CATS_KEY, DEFAULT_CATS);
      setCats(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : DEFAULT_CATS);
    };
    read();
    return onSettingChange(k => { if (k === CATS_KEY) read(); });
  }, []);
  return [cats, (next: string[]) => { setCats(next); setSetting(CATS_KEY, next); }];
}
const EMPTY = { cat: '', title: '', ooc: '', example: '', img: null as string | null, memo: '' };

/** 긴 글은 다섯 줄까지만 — 눌러서 펼친다 */
function LongText({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 5;
  return (
    <>
      <div className={`${className} ${long && !open ? 'clamp' : ''}`}>{text}</div>
      {long && <button type="button" className="pb-more" onClick={() => setOpen(v => !v)}>{open ? '접기' : '전체 보기'}</button>}
    </>
  );
}

function ExImg({ src, onZoom }: { src: string; onZoom: () => void }) {
  const url = useBlobUrl(src);
  return (
    <button type="button" className="oc-img" onClick={onZoom} aria-label="예시 그림 크게 보기">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : <span />}
    </button>
  );
}
function PicPreview({ src }: { src: string }) {
  const url = useBlobUrl(src);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="pb-pic-img" src={url} alt="" /> : <span className="pb-pic-empty">…</span>;
}

export function OocBackup() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [all, setAll] = useLocalList<OocNote>(MYPROMPT_KEY, []);
  const notes = useMemo(() => all.filter(n => n.kind === 'ooc')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [all]);
  const [cats, setCats] = useOocCats();
  const catOf = (n: OocNote) => (cats.includes(n.cat) ? n.cat : ETC);
  const hasEtc = notes.some(n => !cats.includes(n.cat));
  const tabs = [ALL, ...cats, ...(hasEtc ? [ETC] : [])];
  const [cat, setCat] = useState(ALL);
  const [catEdit, setCatEdit] = useState<string[] | null>(null);
  const [newCat, setNewCat] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [cat, q]);   // 탭·찾기를 바꾸면 처음 몇 개만 다시
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [del, setDel] = useState<OocNote | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const picRef = useRef<HTMLInputElement>(null);
  const canEdit = (n: OocNote) => isAdmin || n.authorId === user?.id;
  const toggle = (id: string) => setOpenIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const curCat = tabs.includes(cat) ? cat : ALL;
  const query = q.trim().toLowerCase();
  const shown = notes.filter(n => (curCat === ALL || catOf(n) === curCat)
    && (!query || [n.title, n.cat, n.ooc, n.example, n.memo].join('\n').toLowerCase().includes(query)));

  const pickImg = async (f?: File) => {
    if (!f || !edit) return;
    setUpBusy(true);
    try { const id = await putBlob(f); setEdit(e => (e ? { ...e, img: id } : e)); }   // 메타데이터를 지운 뒤 올린다
    catch (e) { toast(`그림을 올리지 못했어요 — ${e instanceof Error ? e.message : String(e)}`); }
    setUpBusy(false);
  };

  const save = () => {
    if (!edit || !user) return;
    if (!edit.ooc.trim()) { toast('OOC를 적어 주세요'); return; }
    if (!edit.cat) { toast('분류를 골라 주세요'); return; }
    const prev = edit.id ? notes.find(n => n.id === edit.id) : undefined;
    const item: OocNote = {
      id: edit.id ?? newId(), kind: 'ooc', visibility: 'member',
      authorId: prev?.authorId ?? user.id, authorName: prev?.authorName ?? user.nickname,
      cat: edit.cat.trim(), title: edit.title.trim() || '제목 없음', ooc: edit.ooc.trim(),
      example: edit.example.trim(), img: edit.img, memo: edit.memo.trim(), date: new Date().toISOString(),
    };
    setAll(edit.id ? all.map(n => (n.id === edit.id ? item : n)) : [item, ...all]);
    setCat(ALL);
    setEdit(null);
    toast(edit.id ? '고쳤어요' : '저장했어요');
  };

  return (
    <div className="panel" style={{ padding: 24 }}>
      <div className="pb-head">
        <h4>OOC BACKUP</h4>
        {isAdmin && <button type="button" className="pb-mini oc-catedit" onClick={() => { setCatEdit([...cats]); setNewCat(''); }}>분류 편집</button>}
        <button type="button" className="btn btn-dark pb-add" onClick={() => setEdit({ ...EMPTY, cat: cats.includes(curCat) ? curCat : (cats[0] ?? '') })}>＋ 새 OOC</button>
      </div>
      <div className="pb-tabs oc-tabs" role="tablist">
        {tabs.map(c => (
          <button key={c} type="button" role="tab" aria-selected={curCat === c} className={curCat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {c}<i>{c === ALL ? notes.length : notes.filter(n => catOf(n) === c).length}</i>
          </button>
        ))}
      </div>
      {notes.length > 0 && (<>
        <input className="pb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용으로 찾기" aria-label="OOC 찾기" />
      </>)}

      <div className="pb-list">
        {shown.length === 0 && (
          <p className="hint pb-empty">{q ? '찾는 OOC가 없어요' : '아직 백업한 OOC가 없어요 — ＋ 새 OOC로 올려 보세요'}</p>
        )}
        {shown.slice(0, limit).map(n => {
          const open = openIds.has(n.id) || !!query;
          const hasEx = !!(n.example || n.img);
          return (
            <div key={n.id} className="pb-card">
              <div className="pb-top">
                <b>{n.title}</b>
                {curCat === ALL && <span className="oc-cat">{catOf(n)}</span>}
                {canEdit(n) && (<>
                  <button type="button" className="pb-mini" onClick={() => setEdit({ id: n.id, cat: n.cat, title: n.title, ooc: n.ooc, example: n.example, img: n.img, memo: n.memo })}>고치기</button>
                  <button type="button" className="pb-mini danger" onClick={() => setDel(n)}>삭제</button>
                </>)}
              </div>
              <div className="pb-block">
                <div className="pb-lbl"><span>OOC</span><small>{n.ooc.length}자</small><CopyBtn text={fixEncoded(n.ooc)} label="OOC" /></div>
                <LongText text={fixEncoded(n.ooc)} className="pb-txt oc-txt" />
              </div>
              {hasEx && (
                <button type="button" className={`oc-extog ${open ? 'on' : ''}`} onClick={() => toggle(n.id)} aria-expanded={open}>
                  {open ? '예시 ▲' : '예시 ▼'}
                </button>
              )}
              {hasEx && open && (
                <div className="oc-ex">
                  <div className="oc-ex-lbl">예시 결과</div>
                  {n.img && <ExImg src={n.img} onZoom={() => setView(n.img)} />}
                  {/* 예시는 누르면 한 번에 전부 (사용자 요청 — 두 번 누르게 하지 않는다) */}
                  {n.example && <div className="oc-bubble">{n.example}</div>}
                </div>
              )}
              <div className="pb-foot">{n.authorName ? `${n.authorName} · ` : ''}{fmt(n.date)}{n.memo ? ` · 메모: ${n.memo}` : ''}</div>
            </div>
          );
        })}
        {/* 많이 쌓여도 마이페이지가 너무 길어지지 않게 — 몇 개씩만 (사용자 요청) */}
        {shown.length > PAGE && (
          <div className="pb-pager">
            {limit < shown.length
              ? <button type="button" onClick={() => setLimit(l => l + PAGE)}>더 보기 <i>{shown.length - limit}개 더</i></button>
              : <button type="button" onClick={() => setLimit(PAGE)}>접기 ▲</button>}
          </div>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'OOC 고치기' : '새 OOC'} dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEdit(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={save} disabled={upBusy}>SAVE</button>
        </>}>
        {edit && (
          <div className="pb-form">
            <div className="mini-seg oc-catpick" role="radiogroup" aria-label="분류">
              {cats.map(c => (
                <button key={c} type="button" role="radio" aria-checked={edit.cat === c} className={edit.cat === c ? 'on' : ''} onClick={() => setEdit({ ...edit, cat: c })}>{c}</button>
              ))}
              {!cats.includes(edit.cat) && <button type="button" className="on" disabled>{edit.cat ? `${edit.cat} (예전 분류)` : '분류 없음'}</button>}
            </div>
            <KInput value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="제목" maxLength={60} aria-label="제목" />
            <label className="pb-flabel">OOC</label>
            <KTextarea value={edit.ooc} onChange={e => setEdit({ ...edit, ooc: fixEncoded(e.target.value) })}
              placeholder="(OOC: 지금부터 대사는 짧게, 묘사는 감각 위주로 길게 써 줘.)" style={{ minHeight: 110 }} aria-label="OOC" />
            <label className="pb-flabel">예시 결과 <small>(이 OOC로 돌렸을 때 나온 답 — 선택)</small></label>
            <KTextarea value={edit.example} onChange={e => setEdit({ ...edit, example: e.target.value })}
              placeholder="AI가 답한 내용을 붙여 넣어 주세요" style={{ minHeight: 110 }} aria-label="예시 결과" />
            <label className="pb-flabel">예시 캡처 <small>(선택 · 메타데이터는 지워져요)</small></label>
            <div className="pb-pic">
              {edit.img ? <PicPreview src={edit.img} /> : <span className="pb-pic-empty">없음</span>}
              <button type="button" className="btn btn-ghost" disabled={upBusy} onClick={() => picRef.current?.click()}>
                {upBusy ? '올리는 중…' : edit.img ? '바꾸기' : '그림 고르기'}
              </button>
              {edit.img && <button type="button" className="btn btn-ghost" onClick={() => setEdit({ ...edit, img: null })}>빼기</button>}
              <input ref={picRef} type="file" accept="image/*" hidden onChange={e => { void pickImg(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <KInput value={edit.memo} onChange={e => setEdit({ ...edit, memo: e.target.value })} placeholder="메모 (선택 — 어떤 모델에서 잘 됐는지 등)" maxLength={120} aria-label="메모" />
          </div>
        )}
      </Modal>

      {/* 분류 편집 — 관리자만 (사이트 설정) */}
      <Modal open={!!catEdit} onClose={() => setCatEdit(null)} small title="OOC 분류 편집"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setCatEdit(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            if (!catEdit) return;
            const next = [...new Set(catEdit.map(c => c.trim()).filter(Boolean))];
            if (!next.length) { toast('분류를 하나 이상 남겨 주세요'); return; }
            setCats(next); setCatEdit(null); toast('분류를 바꿨어요');
          }}>SAVE</button>
        </>}>
        {catEdit && (
          <div className="oc-catlist">
            {catEdit.map((c, i) => (
              <div key={i} className="oc-catrow">
                <KInput value={c} maxLength={12} onChange={e => setCatEdit(catEdit.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`분류 ${i + 1}`} />
                <button type="button" disabled={i === 0} onClick={() => { const a = [...catEdit]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setCatEdit(a); }} aria-label="위로">↑</button>
                <button type="button" disabled={i === catEdit.length - 1} onClick={() => { const a = [...catEdit]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setCatEdit(a); }} aria-label="아래로">↓</button>
                <button type="button" className="danger" onClick={() => setCatEdit(catEdit.filter((_, j) => j !== i))} aria-label="빼기">✕</button>
              </div>
            ))}
            <div className="oc-catrow">
              <KInput value={newCat} maxLength={12} placeholder="새 분류 이름" onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newCat.trim()) { setCatEdit([...catEdit, newCat.trim()]); setNewCat(''); } }} aria-label="새 분류" />
              <button type="button" className="add" disabled={!newCat.trim()} onClick={() => { setCatEdit([...catEdit, newCat.trim()]); setNewCat(''); }}>더하기</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>분류를 빼거나 이름을 바꾸면 그 분류로 저장된 OOC는 「기타」 탭으로 가요 (지워지지 않아요)</p>
          </div>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} small title="OOC 삭제"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setDel(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => { if (del) { setAll(all.filter(n => n.id !== del.id)); toast('삭제했어요'); } setDel(null); }}>DELETE</button>
        </>}>
        <p style={{ margin: 0 }}>「{del?.title}」을(를) 지울까요? 되돌릴 수 없어요.</p>
      </Modal>

      {view && <Lightbox srcs={[view]} index={0} onClose={() => setView(null)} />}
    </div>
  );
}
