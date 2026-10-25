'use client';
// 링크 카드 위젯 (사용자 요청) — 길쭉한(3:4) AI 채팅 캐릭터 이미지 하나 | 옆에 플랫폼별 링크.
// 링크는 약자(예: CD, RF)를 한 줄에 하나씩, 사이사이 선을 긋고 늘어나면 아래로 이어진다 (넘치면 스크롤).
// 낮/밤 테마 색은 CSS가 맡는다. 여러 개 추가할 수 있다 (캐릭터마다 하나씩).
// 테마 「스토리」(사용자 요청) — 인스타 스토리처럼 링크마다 동그란 사진 + 움직이는 그라데이션 테두리
// (낮 연두·보라 / 밤 빨강·군청), 누르면 그 링크로. 테두리 움직임은 「빙글빙글」·「흐름」 중에서.
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { hrefOf } from '@/lib/infoStore';

export interface CardLink { label: string; url: string; img?: string | null }

const linksOf = (conf: WidgetConf): CardLink[] => {
  const v = conf.settings.links;
  return Array.isArray(v)
    ? (v as CardLink[]).map(l => ({ label: String(l?.label ?? ''), url: String(l?.url ?? ''), img: typeof l?.img === 'string' ? l.img : null }))
    : [];
};
const themeOf = (conf: WidgetConf) => (conf.settings.theme === 'story' ? 'story' : 'card');
const motionOf = (conf: WidgetConf) => (conf.settings.motion === 'spin' ? 'spin' : 'flow');   // 기본은 흐름(B, 사용자 선택)

/** 스토리 테마의 동그라미 하나 */
function StoryItem({ l }: { l: CardLink }) {
  const src = usePic(l.img);
  return (
    <a className="lcs-item" href={hrefOf(l.url)} target="_blank" rel="noopener noreferrer">
      <span className="lcs-ring"><i aria-hidden /></span>
      <span className="lcs-pic">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" draggable={false} /> : <b>{l.label.trim().slice(0, 2)}</b>}
      </span>
      <span className="lcs-lb">{l.label.trim()}</span>
    </a>
  );
}
const imgOf = (conf: WidgetConf) => (typeof conf.settings.img === 'string' ? conf.settings.img : null);
const nameOf = (conf: WidgetConf) => (typeof conf.settings.name === 'string' ? conf.settings.name : '');

/** 사진 주소 — 사이트에 든 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string | null) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img ?? undefined);
  return fixed ?? blob;
}

export function LinkCardWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === conf.id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [conf.id]);
  const src = usePic(imgOf(conf));
  const name = nameOf(conf).trim();
  const links = linksOf(conf).filter(l => l.label.trim() && hrefOf(l.url));
  const modal = (
    <Modal open={open} onClose={() => setOpen(false)} title="링크 카드"
      desc="캐릭터 이미지 하나와 플랫폼별 링크 — 약자는 짧게(예: CD, RF, TP)"
      actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
      {open && <LinkCardEditor conf={conf} />}
    </Modal>
  );
  if (themeOf(conf) === 'story') {
    return (
      <div className={`panel widget lcs-widget ${motionOf(conf)}`}>
        {name && <div className="lcs-name">{name}</div>}
        <div className="lcs-row">
          {links.length
            ? links.map((l, i) => <StoryItem key={i} l={l} />)
            : isAdmin && <span className="lc-empty">⚙ 눌러 링크 추가</span>}
        </div>
        {modal}
      </div>
    );
  }
  return (
    <div className="panel widget lc-widget">
      <div className="lc-pic">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={name} draggable={false} /> : <span>{isAdmin ? '＋ 이미지' : ''}</span>}
      </div>
      <div className="lc-side">
        {name && <div className="lc-name">{name}</div>}
        <div className="lc-links">
          {links.length
            ? links.map((l, i) => (
              <a key={i} className="lc-chip" href={hrefOf(l.url)} target="_blank" rel="noopener noreferrer">
                {l.label.trim()}<i aria-hidden>↗</i>
              </a>
            ))
            : isAdmin && <span className="lc-empty">⚙ 눌러 링크 추가</span>}
        </div>
      </div>
      {modal}
    </div>
  );
}

/** 스토리 테마 — 링크마다 동그란 사진 고르기 */
function LinkPic({ img, onPick }: { img?: string | null; onPick: (v: string | null) => void }) {
  const src = usePic(img);
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="lc-erpic" data-tip={src ? '사진 바꾸기' : '사진 넣기'} onClick={() => { if (!busy) ref.current?.click(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span>{busy ? '…' : '＋'}</span>}
      </button>
      <input ref={ref} type="file" accept="image/*" data-crop="1:1" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { onPick(await putBlob(f)); } catch (err) { toast(`이미지를 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          setBusy(false);
        }} />
    </>
  );
}

export function LinkCardEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const links = linksOf(conf);
  const setLinks = (n: CardLink[]) => set({ links: n });
  const src = usePic(imgOf(conf));
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= links.length) return;
    const n = [...links];
    [n[i], n[j]] = [n[j], n[i]];
    setLinks(n);
  };
  const story = themeOf(conf) === 'story';
  return (
    <div className="lc-edit">
      {/* 테마 (사용자 요청) — 지금 카드 그대로 / 인스타 스토리처럼 동그란 사진 */}
      <div className="lc-etheme">
        <span>테마</span>
        <div className="mini-seg">
          <button type="button" className={!story ? 'on' : ''} onClick={() => set({ theme: 'card' })}>카드</button>
          <button type="button" className={story ? 'on' : ''} onClick={() => set({ theme: 'story' })}>스토리</button>
        </div>
        {story && (
          <div className="mini-seg">
            <button type="button" className={motionOf(conf) === 'flow' ? 'on' : ''} onClick={() => set({ motion: 'flow' })}>흐름</button>
            <button type="button" className={motionOf(conf) === 'spin' ? 'on' : ''} onClick={() => set({ motion: 'spin' })}>빙글빙글</button>
          </div>
        )}
      </div>
      {!story && <div className="lc-edit-top">
        <button type="button" className="lc-epic" onClick={() => { if (!busy) fileRef.current?.click(); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" /> : <span>{busy ? '올리는 중…' : '＋ 이미지'}</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" data-crop="3:4" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true);
            try { set({ img: await putBlob(f) }); } catch (err) { toast(`이미지를 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
            setBusy(false);
          }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="k-input" value={nameOf(conf)} placeholder="캐릭터 이름 (선택)" onChange={e => set({ name: e.target.value })} />
          {imgOf(conf) && <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 10.5 }} onClick={() => set({ img: null })}>이미지 빼기</button>}
        </div>
      </div>}
      {story && (
        <input className="k-input" value={nameOf(conf)} placeholder="위젯 제목 (선택)" onChange={e => set({ name: e.target.value })} />
      )}
      <div className="lc-erows">
        {links.map((l, i) => (
          <div key={i} className="lc-erow">
            {story && <LinkPic img={l.img} onPick={img => { const n = [...links]; n[i] = { ...l, img }; setLinks(n); }} />}
            <input className="k-input lc-elabel" value={l.label} placeholder={story ? '이름' : '약자'} maxLength={story ? 16 : 12}
              onChange={e => { const n = [...links]; n[i] = { ...l, label: e.target.value }; setLinks(n); }} />
            <input className="k-input lc-eurl" value={l.url} placeholder="https://… 캐릭터 링크"
              onChange={e => { const n = [...links]; n[i] = { ...l, url: e.target.value }; setLinks(n); }} />
            <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
            <button type="button" aria-label="아래로" disabled={i === links.length - 1} onClick={() => move(i, 1)}>▼</button>
            <button type="button" aria-label="빼기" onClick={() => setLinks(links.filter((_, j) => j !== i))}>−</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', padding: '5px 14px', fontSize: 11.5 }}
          onClick={() => setLinks([...links, { label: '', url: '' }])}>＋ 링크 추가</button>
      </div>
    </div>
  );
}
