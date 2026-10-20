'use client';
/**
 * 인포 페이지 (사용자 요청) — 목록 없이 **자기소개 글 하나**만 보이는 페이지.
 *
 * 글은 정해진 템플릿이다: 닉네임 · 아이디 · 공지 · LIST(접기) · PLAYING(제작자 · 캐릭터) · NG · 페어 소개(이미지 + 페어명) 2칸 · ETC.(다른 계정).
 * 관리자는 EDIT을 누르면 **같은 카드 모양 그대로** 칸이 입력창으로 바뀌어, 칸만 채우고 저장한다.
 * 카드 색·장식은 홈의 낮/밤 장면을 따라 저절로 바뀐다 (낮 = 풀잎·들꽃, 밤 = 별·달·벚꽃잎).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useInfo, InfoDoc, normInfo, handleOf, profileUrl, INFO_PLATFORMS } from '@/lib/infoStore';
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

function PairPic({ img, editing, onSet }: { img: string | null; editing: boolean; onSet: (ref: string | null) => void }) {
  const toast = useToast();
  const src = usePic(img);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`if-pic ${editing ? 'edit' : ''}`}
      onClick={() => { if (editing && !busy) fileRef.current?.click(); }}>
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

/** 낮/밤 장식 — 둘 다 그려 두고 CSS가 지금 장면 것만 보인다 */
/** **굵게** — 별표 두 개로 감싼 부분만 굵게 (리스트 위 글, 사용자 요청) */
function BoldText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*\n]+?\*\*)/g).map((t, i) =>
    /^\*\*[^*\n]+?\*\*$/.test(t) ? <b key={i}>{t.slice(2, -2)}</b> : t)}</>;
}

/** 리스트 위 글 입력칸 — 글자를 드래그하고 B를 누르면 **로 감싼다 */
function BoldArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
      <textarea ref={ref} className="if-in if-notice if-lnote" value={value} rows={2}
        placeholder={'목록 위에 쓸 글 (비워 두면 안 보여요) — 굵게는 **글자**'}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Deco() {
  const leaf = (
    <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M4 70 Q40 40 90 30 T146 8" />
      <path d="M30 52 q-4-14 8-20 q4 12-8 20z" className="lf" />
      <path d="M62 38 q2-14 16-16 q-2 14-16 16z" className="lf" />
      <path d="M98 27 q-2-12 10-17 q2 12-10 17z" className="lf" />
    </g>
  );
  const stars: [number, number, number][] = [[40, 30, 1.2], [90, 70, .8], [150, 22, 1], [520, 40, 1.3], [580, 96, .9], [610, 24, .7], [470, 18, .8], [200, 60, .6]];
  const petal = 'M0,-6 C4.5,-6 6,0 0,6 C-6,0 -4.5,-6 0,-6Z';
  return (
    <>
      <svg className="if-deco if-day if-d-tl" width="150" height="90" viewBox="0 0 150 90" aria-hidden>
        {leaf}
        <g transform="translate(118,22)"><circle r="5" className="fl" /><circle r="2" className="fc" /></g>
        <g transform="translate(46,48)"><circle r="4" className="fl2" /><circle r="1.6" className="fc" /></g>
      </svg>
      <svg className="if-deco if-day if-d-br" width="150" height="90" viewBox="0 0 150 90" aria-hidden>
        {leaf}
        <g transform="translate(110,26)"><circle r="5" className="fl" /><circle r="2" className="fc" /></g>
      </svg>
      <svg className="if-deco if-night if-n-top" viewBox="0 0 640 150" preserveAspectRatio="xMidYMin slice" aria-hidden>
        {stars.map(([x, y, r], i) => <circle key={i} className="if-star" cx={x} cy={y} r={r} style={{ animationDelay: `${i * 0.5}s` }} />)}
        <path d="M70 40 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4z" fill="#f7d6e2" />
        <g transform="translate(560,58)">
          <mask id="ifMoon"><circle r="11" fill="#fff" /><circle r="11" cx="5" cy="-3" fill="#000" /></mask>
          <circle r="16" fill="#fff4c4" opacity=".12" />
          <circle r="11" fill="#fff1c9" mask="url(#ifMoon)" />
        </g>
      </svg>
      <svg className="if-deco if-night if-n-br" width="70" height="40" viewBox="0 0 70 40" aria-hidden>
        <g fill="#e7a8bf" opacity=".75">
          <path transform="translate(12,24) rotate(-20)" d={petal} />
          <path transform="translate(40,12) rotate(30) scale(.7)" d={petal} />
          <path transform="translate(58,30) rotate(70) scale(.55)" d={petal} />
        </g>
      </svg>
    </>
  );
}

function InfoCard({ doc, editing, set }: { doc: InfoDoc; editing: boolean; set: (p: Partial<InfoDoc>) => void }) {
  // 인포 글씨는 전부 나눔명조 (사용자 요청) — 이 페이지에서만 불러온다
  useEffect(() => {
    if (document.getElementById('if-font')) return;
    const l = document.createElement('link');
    l.id = 'if-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
  const ng = editing ? doc.ng : doc.ng.map(s => s.trim()).filter(Boolean);
  const showPairs = editing || doc.pairs.some(p => p.img || p.name.trim());
  const etc = editing ? doc.etc : doc.etc.filter(a => handleOf(a.handle));
  const plays = editing ? doc.plays : doc.plays.filter(a => a.maker.trim() || a.char.trim());
  const list = doc.list.filter(a => a.genre.trim() || a.char.trim());
  return (
    <article className={`if-card ${editing ? 'editing' : ''}`}>
      <Deco />
      <div className="if-eyebrow">INFORMATION</div>
      {editing
        ? <input className="if-in if-nick" value={doc.nick} placeholder="닉네임" onChange={e => set({ nick: e.target.value })} />
        : doc.nick.trim() && <h2 className="if-nick">{doc.nick}</h2>}
      {editing
        ? <div className="if-id"><span>@ <input className="if-in" value={doc.uid} placeholder="아이디" onChange={e => set({ uid: e.target.value.replace(/^@\s*/, '') })} /></span></div>
        : doc.uid.trim() && <div className="if-id"><span>@ {doc.uid}</span></div>}
      <div className="if-orn" aria-hidden><span className="if-day">❀</span><span className="if-night">✦</span></div>

      {(editing || doc.platforms.length > 0) && (
        <section className="if-sec">
          <div className="if-sh"><b>PLATFORM</b></div>
          <div className="if-plat">
            {editing
              ? INFO_PLATFORMS.map(p => {
                const on = doc.platforms.includes(p);
                return (
                  <button key={p} type="button" className={on ? 'on' : ''} aria-pressed={on}
                    onClick={() => set({ platforms: on ? doc.platforms.filter(x => x !== p) : INFO_PLATFORMS.filter(x => x === p || doc.platforms.includes(x)) })}>
                    {on && <i aria-hidden>✓</i>}{p}
                  </button>
                );
              })
              : doc.platforms.map(p => <span key={p}>{p}</span>)}
          </div>
          {editing && <p className="if-hint">쓰는 플랫폼을 눌러 골라 주세요 — 고르지 않은 것은 보이지 않아요</p>}
        </section>
      )}

      {(editing || doc.notice.trim()) && (
        <section className="if-sec">
          <div className="if-sh"><b>NOTICE</b></div>
          {editing
            ? <textarea className="if-in if-notice" value={doc.notice} rows={4} placeholder={'공지를 적어 주세요 — 줄을 바꾸면 그대로 줄바꿈돼요'}
              onChange={e => set({ notice: e.target.value })} />
            : <div className="if-notice">{doc.notice}</div>}
        </section>
      )}

      {/* LIST — 접어 둔 항목, 누르면 펼쳐진다 (사용자 요청) · 장르 | 캐릭터 */}
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
                  <button type="button" aria-label="빼기" onClick={() => set({ list: doc.list.filter((_, j) => j !== i) })}>−</button>
                </div>
              ))}
              <button type="button" className="if-ng-add" onClick={() => set({ list: [...doc.list, { genre: '', char: '' }] })}>＋ 추가</button>
            </div>
          </>) : (
            <details className="if-fold">
              <summary className="if-sh"><b>LIST</b><span className="if-fold-ic" aria-hidden>▾</span></summary>
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
            </details>
          )}
        </section>
      )}

      {(editing || plays.length > 0) && (
        <section className="if-sec">
          <div className="if-sh"><b>PLAYING</b></div>
          <div className="if-play">
            {editing ? doc.plays.map((a, i) => (
              <div key={i} className="if-prow edit">
                <span className="if-pmaker">@<input className="if-in" value={a.maker} placeholder="제작자 아이디"
                  onChange={e => { const n = [...doc.plays]; n[i] = { ...a, maker: e.target.value }; set({ plays: n }); }} /></span>
                <input className="if-in if-pchar" value={a.char} placeholder="캐릭터 이름"
                  onChange={e => { const n = [...doc.plays]; n[i] = { ...a, char: e.target.value }; set({ plays: n }); }} />
                <button type="button" aria-label="빼기" onClick={() => set({ plays: doc.plays.filter((_, j) => j !== i) })}>−</button>
              </div>
            )) : plays.map((a, i) => (
              <div key={i} className="if-prow">
                {a.maker && <span className="if-pmaker">@{a.maker}</span>}
                <span className="if-pchar">{a.char}</span>
              </div>
            ))}
            {editing && <button type="button" className="if-ng-add" onClick={() => set({ plays: [...doc.plays, { maker: '', char: '' }] })}>＋ 추가</button>}
          </div>
        </section>
      )}

      {(editing || ng.length > 0) && (
        <section className="if-sec">
          <div className="if-sh"><b>NG</b></div>
          <div className="if-ng">
            {ng.map((s, i) => editing ? (
              <span key={i} className="edit">
                <i>✕</i>
                <input className="if-in" value={s} placeholder="항목" size={Math.max(4, s.length + 1)}
                  onChange={e => { const n = [...doc.ng]; n[i] = e.target.value; set({ ng: n }); }} />
                <button type="button" aria-label="항목 빼기" onClick={() => set({ ng: doc.ng.filter((_, j) => j !== i) })}>−</button>
              </span>
            ) : <span key={i}><i>✕</i>{s}</span>)}
            {editing && <button type="button" className="if-ng-add" onClick={() => set({ ng: [...doc.ng, ''] })}>＋ 항목 추가</button>}
          </div>
        </section>
      )}

      {showPairs && (
        <section className="if-sec">
          <div className="if-sh"><b>PAIR</b></div>
          <div className="if-pairs">
            {doc.pairs.map((p, i) => (editing || p.img || p.name.trim()) && (
              <div key={i} className="if-pair">
                <PairPic img={p.img} editing={editing}
                  onSet={ref => set({ pairs: doc.pairs.map((q, j) => (j === i ? { ...q, img: ref } : q)) })} />
                {editing
                  ? <input className="if-in if-pn" value={p.name} placeholder="페어명 (예: 도브 & 시오)"
                    onChange={e => set({ pairs: doc.pairs.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)) })} />
                  : p.name.trim() && <div className="if-pn"><PairName name={p.name} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(editing || etc.length > 0) && (
        <section className="if-sec">
          <div className="if-sh"><b>ETC.</b></div>
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
        </section>
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
      ng: draft.ng.map(s => s.trim()).filter(Boolean),
      plays: draft.plays.map(a => ({ maker: a.maker.trim().replace(/^@+/, ''), char: a.char.trim() })).filter(a => a.maker || a.char),
      etc: draft.etc.map(a => ({ handle: handleOf(a.handle), desc: a.desc.trim() })).filter(a => a.handle),
    }));
    setEditing(false);
    toast('저장되었습니다');
  };

  const empty = !doc.nick.trim() && !doc.uid.trim() && !doc.notice.trim() && !doc.list.some(a => a.genre.trim() || a.char.trim()) && !doc.listNote.trim() && !doc.platforms.length
    && !doc.ng.some(s => s.trim()) && !doc.pairs.some(p => p.img || p.name.trim())
    && !doc.etc.some(a => handleOf(a.handle)) && !doc.plays.some(a => a.maker.trim() || a.char.trim());

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
