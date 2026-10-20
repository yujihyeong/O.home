'use client';
/**
 * 인포 페이지 (사용자 요청) — 목록 없이 **자기소개 글 하나**만 보이는 페이지.
 *
 * 글은 정해진 템플릿이다 (카드 블록형, 사용자 확정): 프로필(이미지 · 닉네임 · 아이디) · INFO · NOTICE · NG · ACCOUNT · DREAM · LIST(접기) · ETC.
 * 관리자는 EDIT을 누르면 **같은 카드 모양 그대로** 칸이 입력창으로 바뀌어, 칸만 채우고 저장한다.
 * 카드 색은 홈의 낮/밤 장면을 따라 저절로 바뀐다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { useInfo, InfoDoc, normInfo, handleOf, profileUrl, hrefOf, INFO_PLATFORMS, INFO_AGES, INFO_COUPLINGS, INFO_TASTES, INFO_ACCOUNT } from '@/lib/infoStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

/** 사진 주소 — 사이트에 든 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string | null) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img ?? undefined);
  return fixed ?? blob;
}

/** 페어명의 「&」만 포인트 색 필기체로 */
function PairName({ name }: { name: string }) {
  const parts = name.split('&');
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <em>&amp;</em>}
          {p.trim()}
        </React.Fragment>
      ))}
    </>
  );
}

function PairPic({ img, editing, onSet, onOpen }: { img: string | null; editing: boolean; onSet: (ref: string | null) => void; onOpen?: () => void }) {
  const toast = useToast();
  const src = usePic(img);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`if-pic ${editing ? 'edit' : ''} ${!editing && onOpen ? 'open' : ''}`}
      role={!editing && onOpen ? 'button' : undefined} tabIndex={!editing && onOpen ? 0 : undefined}
      onKeyDown={e => { if (!editing && onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      onClick={() => { if (editing) { if (!busy) fileRef.current?.click(); } else onOpen?.(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" draggable={false} /> : <span className="if-pic-empty">{editing ? (busy ? '올리는 중…' : '＋ 이미지') : ''}</span>}
      {editing && src && <span className="if-pic-hint">{busy ? '올리는 중…' : '눌러서 바꾸기'}</span>}
      {editing && img && (
        <button type="button" className="if-pic-x" aria-label="이미지 빼기"
          onClick={e => { e.stopPropagation(); onSet(null); }}>✕</button>
      )}
      {editing && (
        <input ref={fileRef} type="file" accept="image/*" data-crop="4:3" style={{ display: 'none' }}
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

/** **굵게** — 별표 두 개로 감싼 부분만 굵게 (리스트 위 글, 사용자 요청) */
function BoldText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*\n]+?\*\*)/g).map((t, i) =>
    /^\*\*[^*\n]+?\*\*$/.test(t) ? <b key={i}>{t.slice(2, -2)}</b> : t)}</>;
}

/** 리스트 위 글 입력칸 — 글자를 드래그하고 B를 누르면 **로 감싼다 */
function BoldArea({ value, onChange, placeholder, cls = 'if-lnote' }: { value: string; onChange: (v: string) => void; placeholder?: string; cls?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const bold = () => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const sel = value.slice(a, b);
    // 이미 굵게면 풀고, 아니면 감싼다
    const on = /^\*\*[\s\S]*\*\*$/.test(sel) && sel.length >= 4;
    const done = on ? sel.slice(2, -2) : `**${sel || '굵게'}**`;
    onChange(value.slice(0, a) + done + value.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a, a + done.length); });
  };
  return (
    <div className="if-bold-wrap">
      <button type="button" className="if-bold-btn" onMouseDown={e => e.preventDefault()} onClick={bold}
        title="드래그한 글자를 굵게 — **글자** 로 감싸져요"><b>B</b> 굵게</button>
      <textarea ref={ref} className={`if-in if-notice ${cls}`} value={value} rows={2}
        placeholder={placeholder ?? '목록 위에 쓸 글 (비워 두면 안 보여요) — 굵게는 **글자**'}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/** 줄 순서 바꾸기 — i번째를 d(−1 위 / +1 아래)만큼 */
function moveRow<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = [...arr];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

/** 동그란 프로필 — 편집 중엔 눌러서 이미지 고르기 (정사각형으로 자르기) */
function Avatar({ img, editing, onSet }: { img: string | null; editing: boolean; onSet: (ref: string | null) => void }) {
  const toast = useToast();
  const src = usePic(img);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`ib-av ${editing ? 'edit' : ''}`} onClick={() => { if (editing && !busy) fileRef.current?.click(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" draggable={false} /> : editing && <span>{busy ? '…' : '＋'}</span>}
      {editing && img && (
        <button type="button" className="ib-av-x" aria-label="프로필 빼기" onClick={e => { e.stopPropagation(); onSet(null); }}>✕</button>
      )}
      {editing && (
        <input ref={fileRef} type="file" accept="image/*" data-crop="1:1" style={{ display: 'none' }}
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

/** 편집 중 고르기 버튼 묶음 — multi면 여러 개, 아니면 하나만(다시 누르면 해제) */
function Picks({ all, value, multi, onChange }: { all: string[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void }) {
  return (
    <div className="ib-picks">
      {all.map(a => {
        const on = value.includes(a);
        return (
          <button key={a} type="button" className={on ? 'on' : ''} aria-pressed={on}
            onClick={() => onChange(multi
              ? (on ? value.filter(x => x !== a) : all.filter(x => x === a || value.includes(x)))
              : (on ? [] : [a]))}>{a}</button>
        );
      })}
    </div>
  );
}

const linesOf = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);

function Sec({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="if-sec">
      <div className="if-sh"><b>{title}</b>{hint}</div>
      {children}
    </section>
  );
}

/**
 * 카드 블록형 템플릿 (사용자 확정 시안) — 프로필 · INFO(성별·연령·커플링·성향·플랫폼) · NOTICE(♡) · NG(✕)
 * · ACCOUNT(고른 것만 네모칸) · DREAM(이미지 + 커플명, 누르면 글) · LIST(접기) · ETC.
 */
function InfoCard({ doc, editing, set }: { doc: InfoDoc; editing: boolean; set: (p: Partial<InfoDoc>) => void }) {
  // 인포 글씨는 전부 나눔명조 (사용자 요청) — 이 페이지에서만 불러온다
  useEffect(() => {
    if (document.getElementById('if-font')) return;
    const l = document.createElement('link');
    l.id = 'if-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
  const [pop, setPop] = useState<number | null>(null);   // DREAM 사진을 눌러 연 글
  useEffect(() => {
    if (pop === null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [pop]);
  const popPair = pop !== null && !editing ? doc.pairs[pop] : null;
  const notice = linesOf(doc.notice), ng = linesOf(doc.ng);
  const showPairs = editing || doc.pairs.some(p => p.img || p.name.trim());
  const etc = editing ? doc.etc : doc.etc.filter(a => handleOf(a.handle));
  const list = doc.list.filter(a => a.genre.trim() || a.char.trim());
  const hasInfo = !!(doc.gender.trim() || doc.age || doc.couplings.length || doc.taste || doc.platforms.length);
  return (
    <article className={`if-card ib-card ${editing ? 'editing' : ''}`}>
      {/* 프로필 — 동그란 이미지 · 닉네임 · 아이디(링크) */}
      <div className="ib-head">
        <Avatar img={doc.avatar} editing={editing} onSet={ref => set({ avatar: ref })} />
        <div className="ib-who">
          {editing
            ? <input className="if-in ib-nick" value={doc.nick} placeholder="닉네임" onChange={e => set({ nick: e.target.value })} />
            : doc.nick.trim() && <h2 className="ib-nick">{doc.nick}</h2>}
          {editing
            ? (<>
              <div className="if-id"><span>@ <input className="if-in" value={doc.uid} placeholder="아이디" onChange={e => set({ uid: e.target.value.replace(/^@\s*/, '') })} /></span></div>
              <div className="if-id-link"><input className="if-in" value={doc.uidLink} placeholder="아이디를 누르면 갈 주소 (비우면 링크 없음)" onChange={e => set({ uidLink: e.target.value })} /></div>
            </>)
            : doc.uid.trim() && (
              <div className="if-id">
                {hrefOf(doc.uidLink)
                  ? <a href={hrefOf(doc.uidLink)} target="_blank" rel="noopener noreferrer">@ {doc.uid}<i aria-hidden>↗</i></a>
                  : <span>@ {doc.uid}</span>}
              </div>
            )}
        </div>
      </div>

      {(editing || hasInfo) && (
        <Sec title="INFO">
          <div className="ib-grid">
            {(editing || doc.gender.trim()) && (
              <div className="ib-cell"><small>GENDER</small>
                {editing ? <input className="if-in" value={doc.gender} placeholder="성별" onChange={e => set({ gender: e.target.value })} /> : <b>{doc.gender}</b>}
              </div>
            )}
            {(editing || doc.age) && (
              <div className="ib-cell"><small>AGE</small>
                {editing ? <Picks all={INFO_AGES} value={doc.age ? [doc.age] : []} onChange={v => set({ age: v[0] ?? '' })} /> : <b>{doc.age}</b>}
              </div>
            )}
            {(editing || doc.couplings.length > 0) && (
              <div className="ib-cell"><small>COUPLING</small>
                {editing ? <Picks all={INFO_COUPLINGS} value={doc.couplings} multi onChange={v => set({ couplings: v })} /> : <b>{doc.couplings.join(' · ')}</b>}
              </div>
            )}
            {(editing || doc.taste) && (
              <div className="ib-cell"><small>TASTE</small>
                {editing ? <Picks all={INFO_TASTES} value={doc.taste ? [doc.taste] : []} onChange={v => set({ taste: v[0] ?? '' })} /> : <b>{doc.taste}</b>}
              </div>
            )}
            {(editing || doc.platforms.length > 0) && (
              <div className="ib-cell full"><small>PLATFORM</small>
                {editing
                  ? <Picks all={INFO_PLATFORMS} value={doc.platforms} multi onChange={v => set({ platforms: v })} />
                  : <div className="ib-plat">{doc.platforms.map(p => <i key={p}>{p}</i>)}</div>}
              </div>
            )}
          </div>
        </Sec>
      )}

      {(editing || notice.length > 0) && (
        <Sec title="NOTICE">
          {editing
            ? <textarea className="if-in ib-lines-in" value={doc.notice} rows={3} placeholder={'한 줄에 하나씩 — 줄마다 앞에 ♡가 붙어요'} onChange={e => set({ notice: e.target.value })} />
            : <div className="ib-lines nt">{notice.map((l, i) => <p key={i}>{l}</p>)}</div>}
        </Sec>
      )}

      {(editing || ng.length > 0) && (
        <Sec title="NG">
          {editing
            ? <textarea className="if-in ib-lines-in" value={doc.ng} rows={3} placeholder={'한 줄에 하나씩 — 줄마다 앞에 ✕가 붙어요'} onChange={e => set({ ng: e.target.value })} />
            : <div className="ib-lines ngl">{ng.map((l, i) => <p key={i}>{l}</p>)}</div>}
        </Sec>
      )}

      {(editing || doc.account.length > 0) && (
        <Sec title="ACCOUNT" hint={editing ? <small>고른 것만 보여요</small> : undefined}>
          {editing
            ? <Picks all={INFO_ACCOUNT} value={doc.account} multi onChange={v => set({ account: v })} />
            : <div className="ib-sq">{doc.account.map(a => <span key={a}>{a}</span>)}</div>}
        </Sec>
      )}

      {showPairs && (
        <Sec title="DREAM" hint={!editing && doc.pairs.some(p => p.desc.trim()) ? <small>클릭 시 자세한 성향</small> : undefined}>
          <div className="if-pairs">
            {doc.pairs.map((p, i) => (editing || p.img || p.name.trim()) && (
              <div key={i} className="if-pair">
                <PairPic img={p.img} editing={editing}
                  onOpen={p.desc.trim() ? () => setPop(i) : undefined}
                  onSet={ref => set({ pairs: doc.pairs.map((q, j) => (j === i ? { ...q, img: ref } : q)) })} />
                {editing
                  ? <input className="if-in if-pn" value={p.name} placeholder="커플명 (예: 도브 & 시오)"
                    onChange={e => set({ pairs: doc.pairs.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)) })} />
                  : p.name.trim() && <div className="if-pn"><PairName name={p.name} /></div>}
                {editing && (
                  <BoldArea value={p.desc} cls="if-pdesc" placeholder="사진을 누르면 뜨는 글 (비워 두면 안 떠요)"
                    onChange={v => set({ pairs: doc.pairs.map((q, j) => (j === i ? { ...q, desc: v } : q)) })} />
                )}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* DREAM 사진을 누르면 뜨는 글 (사용자 요청) */}
      {popPair && createPortal(
        <div className="if-pop" role="dialog" aria-modal="true" onClick={() => setPop(null)}>
          <div className="if-pop-box" onClick={e => e.stopPropagation()}>
            <button type="button" className="if-pop-x" aria-label="닫기" onClick={() => setPop(null)}>✕</button>
            {popPair.name.trim() && <div className="if-pn"><PairName name={popPair.name} /></div>}
            <div className="if-pop-body"><BoldText text={popPair.desc} /></div>
          </div>
        </div>,
        // 페이지 쪽 transform 안에 있으면 화면 전체를 덮지 못한다 — body에 바로 띄운다
        document.body,
      )}

      {/* LIST — 보는 사람에게는 늘 접힌 채 (사용자 요청) · 장르 | 캐릭터 */}
      {(editing || list.length > 0 || doc.listNote.trim()) && (
        <section className="if-sec">
          {editing ? (<>
            <div className="if-sh"><b>LIST</b><small>보는 사람에게는 접힌 채로 보여요</small></div>
            <BoldArea value={doc.listNote} onChange={v => set({ listNote: v })} />
            <div className="if-play">
              {doc.list.map((a, i) => (
                <div key={i} className="if-prow edit if-lrow">
                  <input className="if-in if-lgenre" value={a.genre} placeholder="장르"
                    onChange={e => { const n = [...doc.list]; n[i] = { ...a, genre: e.target.value }; set({ list: n }); }} />
                  <span className="if-lbar" aria-hidden />
                  <input className="if-in if-pchar" value={a.char} placeholder="캐릭터"
                    onChange={e => { const n = [...doc.list]; n[i] = { ...a, char: e.target.value }; set({ list: n }); }} />
                  <span className="if-move">
                    <button type="button" aria-label="위로" disabled={i === 0} onClick={() => set({ list: moveRow(doc.list, i, -1) })}>▲</button>
                    <button type="button" aria-label="아래로" disabled={i === doc.list.length - 1} onClick={() => set({ list: moveRow(doc.list, i, 1) })}>▼</button>
                  </span>
                  <button type="button" aria-label="빼기" onClick={() => set({ list: doc.list.filter((_, j) => j !== i) })}>−</button>
                </div>
              ))}
              <button type="button" className="if-ng-add" onClick={() => set({ list: [...doc.list, { genre: '', char: '' }] })}>＋ 추가</button>
            </div>
          </>) : (
            <details className="if-fold ib-fold">
              <summary className="if-sh"><b>LIST</b><span className="if-fold-ic" aria-hidden>▾</span><small className="ib-fold-hint">눌러서 펼치기</small></summary>
              <div className="ib-fold-bd">
                {doc.listNote.trim() && <div className="if-notice if-lnote"><BoldText text={doc.listNote} /></div>}
                <div className="if-play">
                  {list.map((a, i) => (
                    <div key={i} className="if-prow if-lrow">
                      <span className="if-lgenre">{a.genre}</span>
                      <span className="if-lbar" aria-hidden />
                      <span className="if-pchar">{a.char}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </section>
      )}

      {(editing || etc.length > 0) && (
        <Sec title="ETC.">
          <div className="if-etc">
            {editing ? doc.etc.map((a, i) => (
              <div key={i} className="if-acct edit">
                <span className="if-acct-h">@<input className="if-in" value={a.handle} placeholder="아이디 또는 프로필 주소"
                  onChange={e => { const n = [...doc.etc]; n[i] = { ...a, handle: e.target.value }; set({ etc: n }); }} /></span>
                <input className="if-in if-acct-d" value={a.desc} placeholder="짧은 계정 설명"
                  onChange={e => { const n = [...doc.etc]; n[i] = { ...a, desc: e.target.value }; set({ etc: n }); }} />
                <button type="button" aria-label="계정 빼기" onClick={() => set({ etc: doc.etc.filter((_, j) => j !== i) })}>−</button>
              </div>
            )) : etc.map((a, i) => (
              <a key={i} className="if-acct" href={profileUrl(a.handle)} target="_blank" rel="noopener noreferrer">
                <span className="if-acct-h">@{handleOf(a.handle)}</span>
                {a.desc.trim() && <span className="if-acct-d">{a.desc}</span>}
                <span className="if-acct-go" aria-hidden>↗</span>
              </a>
            ))}
            {editing && <button type="button" className="if-ng-add" onClick={() => set({ etc: [...doc.etc, { handle: '', desc: '' }] })}>＋ 계정 추가</button>}
          </div>
        </Sec>
      )}
    </article>
  );
}

export default function InfoPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [doc, save, loaded] = useInfo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InfoDoc>(doc);

  // 저장본이 늦게 도착해도(서버 모드) 편집 중이 아니면 화면 값을 맞춰 둔다
  useEffect(() => { if (!editing) setDraft(doc); }, [doc, editing]);

  const start = () => { setDraft(doc); setEditing(true); };
  const done = () => {
    save(normInfo({
      ...draft,
      notice: linesOf(draft.notice).join('\n'),
      ng: linesOf(draft.ng).join('\n'),
      plays: draft.plays.map(a => ({ maker: a.maker.trim().replace(/^@+/, ''), char: a.char.trim() })).filter(a => a.maker || a.char),
      etc: draft.etc.map(a => ({ handle: handleOf(a.handle), desc: a.desc.trim() })).filter(a => a.handle),
    }));
    setEditing(false);
    toast('저장되었습니다');
  };

  const empty = !doc.avatar && !doc.nick.trim() && !doc.uid.trim() && !doc.gender.trim() && !doc.age && !doc.couplings.length && !doc.taste
    && !doc.platforms.length && !doc.notice.trim() && !doc.ng.trim() && !doc.account.length
    && !doc.list.some(a => a.genre.trim() || a.char.trim()) && !doc.listNote.trim()
    && !doc.pairs.some(p => p.img || p.name.trim()) && !doc.etc.some(a => handleOf(a.handle));

  return (
    <section className="page">
      {/* 큰 제목(INFO · 자기소개)은 두지 않는다 (사용자 요청) — 관리자 버튼만 카드 위 오른쪽에 */}
      {isAdmin && (
        <div className="if-actions">
          {editing ? (
            <>
              <button className="btn btn-dark" onClick={done}>SAVE</button>
              <button className="btn btn-ghost" onClick={() => { setDraft(doc); setEditing(false); }}>CANCEL</button>
            </>
          ) : (
            <button className="btn btn-dark" onClick={start}>✎ EDIT</button>
          )}
        </div>
      )}

      {editing
        ? <InfoCard doc={draft} editing set={p => setDraft(d => ({ ...d, ...p }))} />
        /* 저장본이 아직 안 왔을 때 「비어 있습니다」가 잠깐 스치지 않게 loaded를 본다 */
        : loaded && empty
          ? (
            <div className="panel" style={{ padding: 26 }}>
              <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
                {isAdmin ? '아직 비어 있습니다 — 오른쪽 위 EDIT으로 칸을 채워 주세요' : '아직 준비 중입니다'}
              </p>
            </div>
          )
          : loaded && <InfoCard doc={doc} editing={false} set={() => {}} />}
    </section>
  );
}
