'use client';
/**
 * 프롬프트 게시판 (사용자 요청) — 한 캐릭터의 여러 복장 프롬프트를 모아 두는 곳.
 *
 *  · 목록: 캐릭터(글)마다 카드 한 장 — 첫 탭 이미지 · 이름 · 복장 수
 *  · 글:   위쪽 인덱스(복장 탭)를 누르면 아래 「이미지 | 프롬프트」가 그 복장으로 바뀐다
 *          프롬프트는 📋 버튼 하나로 복사
 *  · 관리자는 ✎ EDIT으로 같은 화면에서 탭을 늘리고(＋) 이름·이미지·프롬프트를 채운다
 *  · 목록 위 공지 (사용자 요청) — 관리자는 그 자리에서 고친다
 *  · 게시판 비밀번호 (사용자 요청) — 걸면 글이 암호화돼 저장되고, 비밀번호를 넣어야 열린다 (promptStore 참고)
 */
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useRouteSearch } from '@/lib/routeParams';
import { usePromptBoard, PromptPost, PromptTab, newTab, newPromptPost } from '@/lib/promptStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/** 사진 주소 — 사이트에 든 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string | null) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img ?? undefined);
  return fixed ?? blob;
}

/** 클립보드 복사 — 막힌 환경(오래된 사파리 등)에서는 숨은 입력칸으로 한 번 더 */
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

function CopyBtn({ text }: { text: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t); }, [done]);
  return (
    <button type="button" className={`pr-copy ${done ? 'done' : ''}`} aria-label="프롬프트 복사" data-tip="복사"
      disabled={!text.trim()}
      onClick={async () => { if (await copyText(text)) setDone(true); else toast('복사하지 못했어요 — 길게 눌러 직접 복사해 주세요'); }}>
      {done ? '✅' : '📋'}
    </button>
  );
}

function TabPic({ img, editing, onSet }: { img: string | null; editing: boolean; onSet: (ref: string | null) => void }) {
  const toast = useToast();
  const src = usePic(img);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`pr-pic ${editing ? 'edit' : ''}`} onClick={() => { if (editing && !busy) fileRef.current?.click(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" draggable={false} /> : <span className="pr-pic-empty">{editing ? (busy ? '올리는 중…' : '＋ 이미지') : '이미지 없음'}</span>}
      {editing && src && <span className="pr-pic-hint">{busy ? '올리는 중…' : '눌러서 바꾸기'}</span>}
      {editing && img && (
        <button type="button" className="pr-pic-x" aria-label="이미지 빼기" onClick={e => { e.stopPropagation(); onSet(null); }}>✕</button>
      )}
      {editing && (
        <input ref={fileRef} type="file" accept="image/*" data-crop="3:4" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true);
            try { onSet(await putBlob(f)); } catch (err) { toast(`이미지를 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
            setBusy(false);
          }} />
      )}
    </div>
  );
}

/** 목록 카드 한 장 */
function PostCard({ post, onOpen }: { post: PromptPost; onOpen: () => void }) {
  const first = post.tabs.find(t => t.img) ?? post.tabs[0];
  const src = usePic(first?.img);
  return (
    <button type="button" className="pr-card" onClick={onOpen}>
      <div className="pr-card-pic">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" draggable={false} /> : <span>📝</span>}
      </div>
      <div className="pr-card-t">{post.title.trim() || '제목 없음'}</div>
      <div className="pr-card-n">{post.tabs.length} outfit{post.tabs.length > 1 ? 's' : ''}</div>
    </button>
  );
}

/** 글 하나 — 인덱스 + 이미지 | 프롬프트 */
function PostView({ post, editing, onChange }: { post: PromptPost; editing: boolean; onChange: (p: PromptPost) => void }) {
  const [cur, setCur] = useState(post.tabs[0]?.id ?? '');
  const tab = post.tabs.find(t => t.id === cur) ?? post.tabs[0];
  const idx = post.tabs.findIndex(t => t.id === tab?.id);
  const setTab = (p: Partial<PromptTab>) => onChange({ ...post, tabs: post.tabs.map(t => (t.id === tab.id ? { ...t, ...p } : t)) });
  const move = (d: -1 | 1) => {
    const j = idx + d;
    if (j < 0 || j >= post.tabs.length) return;
    const tabs = [...post.tabs];
    [tabs[idx], tabs[j]] = [tabs[j], tabs[idx]];
    onChange({ ...post, tabs });
  };
  if (!tab) return null;
  return (
    <article className="panel pr-post">
      {editing
        ? <input className="pr-in pr-title" value={post.title} placeholder="캐릭터 이름" onChange={e => onChange({ ...post, title: e.target.value })} />
        : <h2 className="pr-title">{post.title.trim() || '제목 없음'}</h2>}

      <div className="pr-index" role="tablist">
        {post.tabs.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab.id}
            className={t.id === tab.id ? 'on' : ''} onClick={() => setCur(t.id)}>
            {t.name.trim() || `#${i + 1}`}
          </button>
        ))}
        {editing && (
          <button type="button" className="pr-index-add" aria-label="복장 추가"
            onClick={() => { const t = newTab(); onChange({ ...post, tabs: [...post.tabs, t] }); setCur(t.id); }}>＋</button>
        )}
      </div>

      {editing && (
        <div className="pr-tabbar">
          <input className="pr-in" value={tab.name} placeholder={`복장 이름 (예: 교복)`} onChange={e => setTab({ name: e.target.value })} />
          <button type="button" className="btn btn-ghost" disabled={idx <= 0} onClick={() => move(-1)} aria-label="앞으로">◀</button>
          <button type="button" className="btn btn-ghost" disabled={idx >= post.tabs.length - 1} onClick={() => move(1)} aria-label="뒤로">▶</button>
          <button type="button" className="btn btn-ghost" disabled={post.tabs.length <= 1}
            onClick={() => { const rest = post.tabs.filter(t => t.id !== tab.id); onChange({ ...post, tabs: rest }); setCur(rest[Math.max(0, idx - 1)].id); }}>
            이 복장 삭제
          </button>
        </div>
      )}

      <div className="pr-body">
        <TabPic img={tab.img} editing={editing} onSet={img => setTab({ img })} />
        <div className="pr-prompt">
          {editing
            ? <textarea className="pr-in pr-ptext" value={tab.prompt} placeholder="프롬프트를 붙여 넣어 주세요" onChange={e => setTab({ prompt: e.target.value })} />
            : <div className="pr-ptext">{tab.prompt || <span className="hint">프롬프트가 아직 없어요</span>}</div>}
          {!editing && <CopyBtn text={tab.prompt} />}
        </div>
      </div>
    </article>
  );
}

/** 목록 위 공지 — 관리자는 ✎로 그 자리에서 고친다 */
function NoticeBox({ text, editable, onSave }: { text: string; editable: boolean; onSave: (s: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(text);
  if (!text.trim() && !editable) return null;
  return (
    <div className="pr-notice">
      <span className="pr-notice-tag">NOTICE</span>
      {edit
        ? (
          <div className="pr-notice-edit">
            <textarea className="pr-in" rows={3} value={v} onChange={e => setV(e.target.value)} placeholder="공지 — 줄을 바꾸면 그대로 줄바꿈돼요" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>CANCEL</button>
              <button type="button" className="btn btn-dark" onClick={() => { onSave(v); setEdit(false); }}>SAVE</button>
            </div>
          </div>
        )
        : <div className="pr-notice-t">{text.trim() ? text : <span className="hint">공지가 비어 있어요</span>}</div>}
      {editable && !edit && <button type="button" className="pr-notice-ed" aria-label="공지 고치기" data-tip="공지 고치기" onClick={() => { setV(text); setEdit(true); }}>✎</button>}
    </div>
  );
}

/** 잠금 화면 — 비밀번호를 넣어야 목록·글이 보인다 */
function LockScreen({ onUnlock }: { onUnlock: (pw: string) => Promise<boolean> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const go = async () => {
    if (!pw || busy) return;
    setBusy(true); setBad(false);
    const ok = await onUnlock(pw);
    setBusy(false);
    if (!ok) { setBad(true); setPw(''); }
  };
  return (
    <div className="panel pr-lock">
      <div className="pr-lock-ic" aria-hidden>🔒</div>
      <p className="pr-lock-t">비밀번호를 입력해 주세요</p>
      <form className={`pr-lock-f ${bad ? 'bad' : ''}`} onSubmit={e => { e.preventDefault(); void go(); }}>
        <input className="pr-in" type="password" value={pw} autoFocus autoComplete="current-password"
          placeholder="비밀번호" onChange={e => { setPw(e.target.value); setBad(false); }} />
        <button type="submit" className="btn btn-dark" disabled={!pw || busy}>{busy ? '…' : '열기'}</button>
      </form>
      {bad && <p className="pr-lock-bad">비밀번호가 맞지 않아요</p>}
    </div>
  );
}

/** 비밀번호 걸기·바꾸기·풀기 */
function PasswordModal({ open, locked, onClose, onSet }: {
  open: boolean; locked: boolean; onClose: () => void; onSet: (pw: string | null) => Promise<void>;
}) {
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setA(''); setB(''); } }, [open]);
  const run = async (pw: string | null, msg: string) => {
    setBusy(true);
    try { await onSet(pw); toast(msg); onClose(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const ok = a.length >= 4 && a === b;
  return (
    <Modal open={open} onClose={onClose} small title={locked ? '게시판 비밀번호 바꾸기' : '게시판 비밀번호 걸기'}
      actions={(
        <>
          {locked && <button className="btn btn-ghost" disabled={busy} onClick={() => run(null, '비밀번호를 풀었어요')}>비밀번호 풀기</button>}
          <button className="btn btn-dark" disabled={!ok || busy} onClick={() => run(a, locked ? '비밀번호를 바꿨어요' : '비밀번호를 걸었어요')}>
            {busy ? '…' : locked ? '바꾸기' : '걸기'}
          </button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="pr-in" type="password" autoComplete="new-password" placeholder={locked ? '새 비밀번호 (4자 이상)' : '비밀번호 (4자 이상)'} value={a} onChange={e => setA(e.target.value)} />
        <input className="pr-in" type="password" autoComplete="new-password" placeholder="한 번 더" value={b} onChange={e => setB(e.target.value)} />
        {b && a !== b && <p className="hint" style={{ margin: 0, color: 'var(--accent)' }}>두 칸이 서로 달라요</p>}
        <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
          비밀번호를 걸면 글 내용이 이 비밀번호로 <b>암호화</b>돼 저장돼요. 관리자는 이 기기에서 바로 들어가지고, 다른 기기에서는 한 번만 넣으면 돼요.
          <b> 잊어버리면 되찾을 방법이 없어요.</b> 공지는 잠금 화면에도 보여요.
        </p>
        <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
          🔁 매달 1일 이후 관리자가 홈에 처음 들어오면 <b>랜덤 4글자</b>로 자동으로 바뀌고, 새 비밀번호는 🔔 알림으로 알려 드려요.
        </p>
      </div>
    </Modal>
  );
}

function PromptInner() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useRouteSearch();
  const pid = params.get('p');
  const board = usePromptBoard(isAdmin);
  const { posts, loaded } = board;
  const save = board.savePosts;
  const [pwOpen, setPwOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PromptPost | null>(null);
  const [askDel, setAskDel] = useState(false);

  const post = pid ? posts.find(p => p.id === pid) ?? null : null;
  // 다른 글로 옮기면 편집은 접는다 (새 글은 ?edit=1로 열려 바로 편집)
  const wantEdit = params.get('edit') === '1';
  useEffect(() => { setEditing(wantEdit); setDraft(null); }, [pid, wantEdit]);

  const open = (id: string | null) => router.push(id ? `/prompt?p=${id}` : '/prompt');

  const startNew = () => {
    const p = newPromptPost();
    save([...posts, p]);   // 새 글은 맨 뒤 — 순서는 목록에서 ◀ ▶로
    router.push(`/prompt?p=${p.id}&edit=1`);
  };
  const isBlank = (p: PromptPost) => !p.title.trim() && p.tabs.every(t => !t.img && !t.prompt.trim() && (!t.name.trim() || t.name === '기본'));
  const done = () => {
    if (draft) save(posts.map(p => (p.id === draft.id ? draft : p)));
    setEditing(false); setDraft(null);
    if (wantEdit) router.replace(`/prompt?p=${pid}`);
    toast('저장되었습니다');
  };
  const cancel = () => {
    setEditing(false); setDraft(null);
    // 새로 만들고 아무것도 안 채운 글은 남기지 않는다
    if (post && isBlank(post)) { save(posts.filter(p => p.id !== post.id)); open(null); return; }
    if (wantEdit) router.replace(`/prompt?p=${pid}`);
  };

  /* ---------- 잠금 ---------- */
  if (loaded && board.sealed) {
    return (
      <section className="page pr-page">
        <div className="page-head">
          <PageTitle>PROMPT</PageTitle>
          <EditableDesc k="prompt-desc" def="캐릭터별 복장 프롬프트" />
        </div>
        <NoticeBox text={board.notice} editable={isAdmin} onSave={board.setNotice} />
        <LockScreen onUnlock={board.unlock} />
      </section>
    );
  }

  /* ---------- 글 하나 ---------- */
  if (pid) {
    const shown = editing ? draft ?? post : post;
    return (
      <section className="page pr-page">
        <div className="pr-actions">
          <button type="button" className="btn btn-ghost" onClick={() => open(null)}>← 목록</button>
          <span style={{ flex: 1 }} />
          {isAdmin && post && (editing ? (
            <>
              <button className="btn btn-dark" onClick={done}>SAVE</button>
              <button className="btn btn-ghost" onClick={cancel}>CANCEL</button>
            </>
          ) : (
            <>
              <button className="btn btn-dark" onClick={() => { setDraft(post); setEditing(true); }}>✎ EDIT</button>
              <button className="btn btn-ghost" onClick={() => setAskDel(true)}>삭제</button>
            </>
          ))}
        </div>
        {shown
          ? <PostView key={shown.id} post={shown} editing={editing} onChange={setDraft} />
          : loaded && <div className="panel" style={{ padding: 26 }}><p className="hint" style={{ margin: 0, textAlign: 'center', padding: '30px 0' }}>없는 글이에요</p></div>}
        <ConfirmModal open={askDel} title="이 글을 삭제할까요?" body="복장 탭과 프롬프트가 모두 지워지고 되돌릴 수 없어요."
          onClose={() => setAskDel(false)}
          buttons={[
            { label: 'CANCEL', kind: 'ghost', onClick: () => setAskDel(false) },
            { label: '삭제', kind: 'accent', onClick: () => { save(posts.filter(p => p.id !== pid)); setAskDel(false); open(null); } },
          ]} />
      </section>
    );
  }

  /* ---------- 목록 ---------- */
  return (
    <section className="page pr-page">
      <div className="page-head">
        <PageTitle>PROMPT</PageTitle>
        <EditableDesc k="prompt-desc" def="캐릭터별 복장 프롬프트" />
        {isAdmin && (
          <div className="head-actions">
            <button className="btn btn-ghost" onClick={() => setPwOpen(true)} aria-label="게시판 비밀번호">{board.locked ? '🔒 비밀번호' : '🔓 비밀번호'}</button>
            <button className="btn btn-dark" onClick={startNew}>＋ 새 글</button>
          </div>
        )}
      </div>
      {loaded && <NoticeBox text={board.notice} editable={isAdmin} onSave={board.setNotice} />}
      <PasswordModal open={pwOpen} locked={board.locked} onClose={() => setPwOpen(false)} onSet={board.setPassword} />
      {loaded && !posts.length
        ? (
          <div className="panel" style={{ padding: 26 }}>
            <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
              {isAdmin ? '아직 글이 없어요 — 오른쪽 위 「＋ 새 글」로 캐릭터를 추가해 주세요' : '아직 준비 중입니다'}
            </p>
          </div>
        )
        : (
          <div className="pr-grid">
            {posts.map((p, i) => (
              <div key={p.id} className="pr-cell">
                <PostCard post={p} onOpen={() => open(p.id)} />
                {isAdmin && (
                  <div className="pr-move">
                    <button type="button" disabled={i === 0} aria-label="앞으로" onClick={() => { const n = [...posts]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n); }}>◀</button>
                    <button type="button" disabled={i === posts.length - 1} aria-label="뒤로" onClick={() => { const n = [...posts]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; save(n); }}>▶</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

export default function PromptPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><PromptInner /></Suspense>;
}
