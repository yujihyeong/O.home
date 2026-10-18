'use client';
/**
 * 프롬프트 게시판 (사용자 요청) — 한 캐릭터의 여러 복장 프롬프트를 모아 두는 곳.
 *
 *  · 목록: 캐릭터(글)마다 카드 한 장 — 첫 탭 이미지 · 이름 · 복장 수
 *  · 글:   위쪽 인덱스(복장 탭)를 누르면 아래 「이미지 | 프롬프트」가 그 복장으로 바뀐다
 *          프롬프트는 📋 버튼 하나로 복사
 *  · 관리자는 ✎ EDIT으로 같은 화면에서 탭을 늘리고(＋) 이름·이미지·프롬프트를 채운다
 */
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useRouteSearch } from '@/lib/routeParams';
import { usePrompts, PromptPost, PromptTab, newTab, newPromptPost } from '@/lib/promptStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ConfirmModal } from '@/components/ui/Modal';
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

function PromptInner() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useRouteSearch();
  const pid = params.get('p');
  const [posts, save, loaded] = usePrompts();
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
    save([p, ...posts]);
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
        {isAdmin && <div className="head-actions"><button className="btn btn-dark" onClick={startNew}>＋ 새 글</button></div>}
      </div>
      {loaded && !posts.length
        ? (
          <div className="panel" style={{ padding: 26 }}>
            <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
              {isAdmin ? '아직 글이 없어요 — 오른쪽 위 「＋ 새 글」로 캐릭터를 추가해 주세요' : '아직 준비 중입니다'}
            </p>
          </div>
        )
        : <div className="pr-grid">{posts.map(p => <PostCard key={p.id} post={p} onOpen={() => open(p.id)} />)}</div>}
    </section>
  );
}

export default function PromptPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><PromptInner /></Suspense>;
}
