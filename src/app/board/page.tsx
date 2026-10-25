'use client';
// 일반 게시판 목록 (4.2 / 5.2 다중 게시판) — 형태(로그 목록 / 갤러리 격자) · 검색 · 비밀글 마스킹 · 접기 표시 · 페이지네이션
// ?b=<게시판 id> 로 게시판 구분 (없으면 기본 게시판) · 리스트 스킨: 기본형 / 티켓형 (5.2 v1.9)
import { LockIcon, ImageIcon } from '@/components/ui/Icons';
import { LockScreen } from '@/components/ui/LockScreen';
import { useToast } from '@/components/ui/Toast';
import { ensurePostContentKey, postLockAvailable, openBody } from '@/lib/promptStore';
import { sealPost, unsealPost, SealedPost, boardKey, createOwnLock, rewrapOwnLock, rememberBoardKey } from '@/lib/boardLock';
import { LockModal as BoardLockModal } from '@/components/ui/LockModal';
import { PostHead } from '@/components/ui/PostHead';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRouteSearch } from '@/lib/routeParams';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, fmtDate, postHref, postNumbers,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import {
  useBoardSettings, useBoards, boardBadgeStyle, boardHref, MAIN_BOARD_ID, BoardPerm,
} from '@/lib/boardStore';
import type { Board } from '@/lib/boardStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { CropImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PER_PAGE = 10;

/** 본문에서 첫 이미지 추출 — 티켓 스킨 썸네일용 (HTML img / MD 이미지) */
function firstImage(body: string): string | null {
  const html = /<img[^>]*src=["']([^"']+)["']/i.exec(body);
  if (html) return html[1];
  const md = /!\[[^\]]*\]\(([^)\s]+)/.exec(body);
  return md ? md[1] : null;
}

function BoardInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const params = useRouteSearch();   // 짧은 주소(/LOG 등) 안에서는 연결된 게시판의 ?b=
  const bid = params.get('b') ?? MAIN_BOARD_ID;
  const { boards, loaded: boardsLoaded, patchBoard } = useBoards();
  const toast = useToast();
  const board = boards.find(b => b.id === bid) ?? boards[0];
  const [posts, setPosts, postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  /* 글 번호 (사용자 요청) — 번호 없는 옛 글에 발행 순서대로 번호를 저장해 둔다 (관리자가 목록을 열 때 한 번).
     관리자는 비밀글까지 모두 보므로 번호가 빠짐없이 매겨진다 */
  useEffect(() => {
    if (!isAdmin || !postsLoaded || !posts.some(p => p.no == null)) return;
    const nums = postNumbers(posts);
    setPosts(posts.map(p => (p.no == null ? { ...p, no: nums.get(p.id) } : p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, postsLoaded, posts]);
  // 댓글 수 — 댓글은 글과 따로 저장된다 (v2.0). 옛 글 안에 남아 있던 것도 함께 센다
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const cmtCount = (p: Post) => commentsFor(cmtRows, 'post', p.id, p.comments).length;
  const { st: boardSet } = useBoardSettings();   // 시스템 뱃지 색 (환경설정 > 게시판 관리)
  // 게시판 형태 — 만들 때 정한 대로 (갤러리 = 이미지 격자, 로그 = 글 목록). 방문자가 고르지 않는다
  const isGallery = board?.kind === 'gallery';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // 게시판 전환 시 필터·페이지 초기화
  const [prevBid, setPrevBid] = useState(bid);
  if (prevBid !== bid) { setPrevBid(bid); setQ(''); setPage(1); }

  // 권한 3단계 — mock 단계에선 로그인 전제 (로드뷰 4.10과 동일 규칙)
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);

  const visible = useMemo(() => {
    let list = posts.filter(p => (p.boardId ?? MAIN_BOARD_ID) === board.id);
    if (q) {
      const k = q.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(k) ||
        p.author.toLowerCase().includes(k) ||
        (p.category ?? '').toLowerCase().includes(k) ||   // 머리말 검색
        (p.tags ?? []).some(t => t.toLowerCase().includes(k)) ||   // 태그 검색 (v2.0 사용자 요청)
        (!p.secret && p.body.toLowerCase().includes(k)));
    }
    // 최신순 — 고정한 글(notice, 사용자 요청)은 맨 위에, 고정 글끼리는 정한 순서(pinOrder)대로
    return list.sort((a, b) => Number(!!b.notice) - Number(!!a.notice) || pinCmp(a, b) || b.date.localeCompare(a.date));
  }, [posts, board.id, q]);

  /* 고정 글 순서 바꾸기 (관리자) — 지금 보이는 순서대로 번호를 다시 매겨 저장 */
  const pinnedList = visible.filter(p => p.notice);
  const movePin = (id: string, d: number) => {
    const ids = pinnedList.map(p => p.id);
    const i = ids.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPosts(posts.map(p => (ids.includes(p.id) ? { ...p, pinOrder: ids.indexOf(p.id) } : p)));
  };
  const pinCtl = (p: Post) => {
    if (!isAdmin || !p.notice || q || pinnedList.length < 2) return null;
    const i = pinnedList.findIndex(x => x.id === p.id);
    return (
      <span className="pin-ctl" onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="위로" disabled={i === 0} onClick={() => movePin(p.id, -1)}>▲</button>
        <button type="button" aria-label="아래로" disabled={i === pinnedList.length - 1} onClick={() => movePin(p.id, 1)}>▼</button>
      </span>
    );
  };
  const pinMark = (p: Post) => (p.notice ? <span className="pin-mark" aria-label="고정">♡</span> : null);

  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const pageList = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  /* 비밀글 열람 (v2.0 발견) — authorId 없는 비밀글은 비로그인 방문자에게도 열렸다.
     둘 다 undefined라 `undefined === undefined`가 참이었기 때문 */
  const canRead = (p: Post) => !p.secret || isAdmin || (!!p.authorId && p.authorId === user?.id);

  /* 게시판 비밀번호 (사용자 요청) — 프롬프트 게시판과 같은 비밀번호. 이 탭에서 연 적 있거나 관리자 기기면 바로 열린다 */
  const locked = !!board?.locked;
  const [gate, setGate] = useState<'checking' | 'open' | 'closed'>('checking');
  const [ck, setCk] = useState<CryptoKey | null>(null);
  useEffect(() => {
    if (!locked) { setGate('open'); return; }
    let alive = true;
    setGate('checking');
    boardKey(board, isAdmin).then(k => { if (!alive) return; setCk(k); setGate(k ? 'open' : 'closed'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, isAdmin, board?.id, board?.lockOwn?.salt]);
  // 봉한 글의 대표 사진 — 열린 뒤에만 이 화면 안에서 풀어 쓴다
  const [thumbs, setThumbs] = useState<Record<string, { src?: string; crop?: Post['thumbCrop'] }>>({});
  useEffect(() => {
    if (!ck) return;
    const need = pageList.filter(p => p.locked && !thumbs[p.id]);
    if (!need.length) return;
    let alive = true;
    void Promise.all(need.map(async p => {
      try {
        const o = await openBody<SealedPost>(ck, p.locked!);
        return [p.id, { src: o.thumbSrc ?? o.images?.[0] ?? firstImage(o.body ?? '') ?? undefined, crop: o.thumbSrc ? o.thumbCrop : undefined }] as const;
      } catch { return [p.id, {}] as const; }
    })).then(rows => { if (alive) setThumbs(t => ({ ...t, ...Object.fromEntries(rows) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ck, pageList.map(p => p.id).join()]);
  const thumbOf = (p: Post) => (canRead(p) ? (p.thumbSrc ?? firstImage(p.body) ?? thumbs[p.id]?.src ?? null) : null);
  const cropOf = (p: Post) => (p.thumbSrc ? p.thumbCrop : thumbs[p.id]?.crop);

  /** 잠그기·풀기 (관리자) — 잠그면 이 게시판 글을 모두 봉하고, 풀면 게시판 잠금으로 봉했던 글만 푼다.
   *  비밀번호는 고른다 (사용자 요청): 자동(프롬프트 게시판과 같이 매달 바뀜) / 직접 정한 비밀번호 */
  const [lockBusy, setLockBusy] = useState(false);
  const [lockAsk, setLockAsk] = useState(false);
  const mine = (p: Post) => (p.boardId ?? MAIN_BOARD_ID) === board.id;
  const lockBoard = async (own: string | null) => {
    let k: CryptoKey | null;
    let lockOwn: Board['lockOwn'];
    if (own) {
      const made = await createOwnLock(own);
      k = made.key; lockOwn = made.lock;
    } else {
      if (!postLockAvailable()) { toast('먼저 프롬프트 게시판에 비밀번호를 걸어 주세요'); return false; }
      k = await ensurePostContentKey();
      if (!k) { toast('이 기기에서 프롬프트 게시판을 한 번 열어 주세요 (비밀번호 입력)'); return false; }
    }
    setPosts(await Promise.all(posts.map(p => (mine(p) && !p.locked ? sealPost(k!, p, true) : Promise.resolve(p)))));
    const nb = { ...board, locked: true, lockOwn };
    patchBoard(board.id, { locked: true, lockOwn });
    if (own) await rememberBoardKey(nb, k);
    setCk(k); setGate('open');
    toast(own ? '게시판에 비밀번호를 걸었어요' : '게시판에 비밀번호를 걸었어요 — 프롬프트 게시판과 같이 매달 바뀌어요');
    return true;
  };
  const unlockBoard = async () => {
    const k = ck ?? await boardKey(board, true);
    if (!k) { toast(board.lockOwn ? '게시판 비밀번호를 먼저 입력해 주세요' : '이 기기에서 프롬프트 게시판을 한 번 열어 주세요 (비밀번호 입력)'); return false; }
    setPosts(await Promise.all(posts.map(p => (mine(p) && p.boardSealed ? unsealPost(k, p) : Promise.resolve(p)))));
    patchBoard(board.id, { locked: false, lockOwn: undefined });
    toast('게시판 비밀번호를 풀었어요');
    return true;
  };
  const changeOwn = async (pw: string) => {
    if (!ck) { toast('게시판 비밀번호를 먼저 입력해 주세요'); return false; }
    const lockOwn = await rewrapOwnLock(pw, ck);
    patchBoard(board.id, { lockOwn });
    await rememberBoardKey({ ...board, lockOwn }, ck);
    toast('게시판 비밀번호를 바꿨어요');
    return true;
  };
  const runLock = async (fn: () => Promise<boolean>) => {
    if (lockBusy) return;
    setLockBusy(true);
    try { if (await fn()) setLockAsk(false); } finally { setLockBusy(false); }
  };

  if (!boardsLoaded) return <section className="page post-read" />;
  if (locked && gate !== 'open') {
    return (
      <section className="page post-read">
        <div className="page-head">
          <PageTitle href={boardHref(board.id)}>{board.id === MAIN_BOARD_ID ? 'BOARD' : board.name}</PageTitle>
          <EditableDesc k={board.id === MAIN_BOARD_ID ? 'board-desc' : `board-desc-${board.id}`} def={board.desc} />
        </div>
        {gate === 'closed' && (
          <LockScreen onUnlock={async pw => {
            const k = await boardKey(board, isAdmin, pw);
            if (!k) return false;
            setCk(k); setGate('open');
            return true;
          }} />
        )}
      </section>
    );
  }


  return (
    <section className="page post-read">
      <div className="page-head">
        <PageTitle href={boardHref(board.id)}>{board.id === MAIN_BOARD_ID ? 'BOARD' : board.name}</PageTitle>
        <EditableDesc k={board.id === MAIN_BOARD_ID ? 'board-desc' : `board-desc-${board.id}`} def={board.desc} />
      </div>
      <div className="toolrow" style={{ justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={v => { setQ(v); setPage(1); }} />
          {isAdmin && (
            <button className={`btn btn-lockic ${locked ? 'btn-dark' : 'btn-ghost'}`} disabled={lockBusy} onClick={() => setLockAsk(true)}
              aria-label={locked ? '게시판 비밀번호 (잠금 중)' : '게시판에 비밀번호 걸기'}
              data-tip={locked ? '잠금 중 — 비밀번호 바꾸기·풀기' : '게시판에 비밀번호 걸기'}>
              <LockIcon open={!locked} size={15} />
            </button>
          )}
          {allow(board.permWrite) && !!user && (
            <button className="btn btn-dark"
              onClick={() => router.push(`/board/write?b=${board.id}`)}>✎ WRITE</button>
          )}
        </div>
      </div>

      {isGallery ? (
        /* 갤러리 게시판 — 이미지 격자 (대표 이미지 > 첫 이미지) */
        <div className="gal-grid">
          {pageList.map(p => {
            const thumb = thumbOf(p);
            return (
              <div className="gal-card" key={p.id} onClick={() => { if (canRead(p)) router.push(postHref(p)); }}>
                <div className="gal-thumb">
                  {thumb
                    ? <CropImg src={thumb} crop={cropOf(p)} />
                    : <div className="bt-ph">{canRead(p) ? <ImageIcon size={22} /> : <LockIcon size={22} />}</div>}
                  {canRead(p) && (p.images?.length ?? 0) > 1 && <span className="gal-n">{p.images!.length}</span>}
                </div>
                <div className="gal-cap">
                  <b>{canRead(p) ? <>{pinMark(p)}{(p.secret || (p.locked && !p.boardSealed)) && <LockIcon className="ic-gap" />}<PostHead cat={p.category} />{p.title}</> : '비밀글입니다'}</b>
                  <small>{p.author} · {fmtDate(p.date)}{pinCtl(p)}</small>
                </div>
              </div>
            );
          })}
          {pageList.length === 0 && (
            <div className="panel" style={{ gridColumn: '1 / -1', padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>갤러리 글이 없습니다</div>
          )}
        </div>
      ) : board.skin === 'ticket' ? (
        /* 티켓형 스킨 (5.2 v1.9) — 왼쪽 썸네일(본문 첫 이미지) + 절취선 + 오른쪽 글 정보 */
        <div style={board.fg ? { color: board.fg } : undefined}>
          {pageList.map(p => {
            // 대표 이미지(직접 선택 + 크롭) 우선, 없으면 본문 첫 이미지 (v1.9)
            const thumb = thumbOf(p);
            return (
              <div className="bticket" key={p.id} onClick={() => { if (canRead(p)) router.push(postHref(p)); }}>
                <div className="bt-thumb">
                  {thumb
                    ? <CropImg src={thumb} crop={cropOf(p)} />
                    : <div className="bt-ph">{(canRead(p) ? p.title : 'SECRET').slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="bt-body">
                  {p.fold && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={boardBadgeStyle(boardSet.system[2])}>{boardSet.system[2].label}</span>
                    </div>
                  )}
                  <div className="bt-title">
                    {canRead(p) ? <>{pinMark(p)}{(p.secret || (p.locked && !p.boardSealed)) && <LockIcon className="ic-gap" />}<PostHead cat={p.category} />{p.title}</> : <><LockIcon className="ic-gap" />비밀글입니다</>}
                    {canRead(p) && cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                  </div>
                  <div className="bt-meta">{p.author} · {fmtDate(p.date)}{pinCtl(p)}</div>
                </div>
              </div>
            );
          })}
          {pageList.length === 0 && (
            <div className="panel" style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>게시글이 없습니다</div>
          )}
        </div>
      ) : (
        /* 기본형 스킨 — 리스트 행 (글씨색은 게시판 관리에서 지정 가능, v1.9) */
        <div className="panel board-list flush" style={board.fg ? { color: board.fg } : undefined}>
          {pageList.map(p => (
            <div className={`brow nocat ${p.notice ? 'pinned' : ''}`} key={p.id} onClick={() => { if (canRead(p)) router.push(postHref(p)); }}>
              {/* 제목 칸 안에서 태그를 오른쪽 끝(=작성자 바로 왼쪽)에 정렬 (v2.0 사용자 요청) —
                  칸을 따로 만들면 행마다 그리드가 독립이라 작성자 열이 태그 길이만큼 어긋난다 */}
              <div className="tcell">
                {canRead(p) ? (
                  <b>
                    {pinMark(p)}{(p.secret || (p.locked && !p.boardSealed)) && <LockIcon className="ic-gap" />}<PostHead cat={p.category} />{p.title}
                    {cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                    {p.fold && <span style={{ ...boardBadgeStyle(boardSet.system[2]), marginLeft: 6 }}>{boardSet.system[2].label}</span>}
                  </b>
                ) : (
                  <b style={{ color: 'var(--faint)' }}><LockIcon className="ic-gap" />비밀글입니다</b>
                )}
                {pinCtl(p)}
                {canRead(p) && (p.tags ?? []).length > 0 && (
                  <span className="tags">{(p.tags ?? []).map(t => <i key={t}>#{t}</i>)}</span>
                )}
              </div>
              <span className="who">{p.author}</span>
              <span className="dt">{fmtDate(p.date)}</span>
            </div>
          ))}
          {pageList.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>게시글이 없습니다</div>
          )}
        </div>
      )}
      <Pager page={page} total={totalPages} onChange={setPage} />
      <BoardLockModal open={lockAsk} locked={locked} own={!!board.lockOwn} busy={lockBusy} onClose={() => setLockAsk(false)}
        onLock={own => runLock(() => lockBoard(own))} onUnlock={() => runLock(unlockBoard)} onChange={pw => runLock(() => changeOwn(pw))} />
    </section>
  );
}

/** 고정 글끼리 순서 — 순서를 정한 글은 번호순, 아직 안 정한(새로 고정한) 글은 그 위에 */
const pinCmp = (a: Post, b: Post) => {
  if (!a.notice || !b.notice) return 0;
  const x = a.pinOrder, y = b.pinOrder;
  if (x == null && y == null) return 0;
  if (x == null) return -1;
  if (y == null) return 1;
  return x - y;
};

export default function BoardPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page post-read" />}><BoardInner /></Suspense>;
}

