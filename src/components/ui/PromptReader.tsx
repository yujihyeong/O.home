'use client';
// 프롬프트 읽기 (사용자 요청 · 시안 B안) — 생성 그림을 넣으면 숨은 생성 정보에서
// 베이스 · 네거티브 · 캐릭터(긍정/부정) 프롬프트를 꺼내 칸마다 복사하게 해 준다. 겹치는 태그는 저절로 지운다.
// 그림은 이 브라우저 안에서만 읽는다(어디에도 올리지 않는다). 사진 자르기 창이 끼어들면 정보가 사라지므로 data-nocrop.
import React, { useEffect, useRef, useState } from 'react';
import { readPromptInfo, promptInfoText, type PromptInfo } from '@/lib/naiMeta';
import { CopyBtn, PromptBlock, PB_PREFILL_EVT } from '@/components/ui/PromptBackup';
import { useToast } from '@/components/ui/Toast';

export function PromptReader() {
  const toast = useToast();
  const [info, setInfo] = useState<PromptInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [none, setNone] = useState(false);
  const [tab, setTab] = useState(0);            // 0 = 베이스, 1.. = 캐릭터
  const [showDup, setShowDup] = useState(false);
  const [over, setOver] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && !/\.(png|webp|jpe?g)$/i.test(f.name)) { toast('그림 파일을 넣어 주세요'); return; }
    setBusy(true); setNone(false); setTab(0); setShowDup(false);
    setFile(f); setUrl(URL.createObjectURL(f));
    try {
      const r = await readPromptInfo(f);
      setInfo(r); setNone(!r);
    } catch { setInfo(null); setNone(true); }
    setBusy(false);
  };

  // 지금 보고 있는 탭만 담는다 (사용자 요청) — 베이스 탭이면 베이스·네거티브, 캐릭터 탭이면 그 캐릭터의 긍정·부정
  const toBackup = () => {
    if (!info) return;
    const c = tab > 0 ? info.chars[tab - 1] : null;
    window.dispatchEvent(new CustomEvent(PB_PREFILL_EVT, {
      detail: { prompt: c ? c.pos : info.base, negative: c ? c.neg : info.negative, file: file ?? undefined },
    }));
  };

  const ch = tab > 0 ? info?.chars[tab - 1] : null;

  return (
    <div className="panel" style={{ padding: 24 }}>
      <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', margin: '0 0 6px' }}>PROMPT READER</h4>
      <p className="hint" style={{ margin: '0 0 12px' }}>그림을 넣으면 숨은 생성 정보를 읽어 프롬프트를 꺼내 줘요 · 그림은 어디에도 올라가지 않아요</p>

      <div className={`ms-drop pr-drop ${over ? 'over' : ''} ${url ? 'has' : ''}`} role="button" tabIndex={0}
        onClick={() => inp.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void load(e.dataTransfer.files?.[0]); }}>
        {url ? '다른 그림 넣기' : '＋ 그림을 끌어다 놓거나 눌러서 고르기'}
      </div>
      <input ref={inp} type="file" accept="image/png,image/webp,image/jpeg" hidden data-nocrop
        onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />

      {url && (
        <div className="pr-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pr-img" src={url} alt="" />
          <div className="pr-meta">
            {busy ? <b>읽는 중…</b>
              : info ? (<>
                <b>{info.source}</b>
                {info.chips.length > 0 && <div className="pr-chips">{info.chips.map(c => <i key={c}>{c}</i>)}</div>}
                <div className={`pr-dedup ${info.removed.length ? '' : 'none'}`}>
                  {info.removed.length
                    ? <>✓ 겹치는 태그 {info.removed.length}개를 지웠어요 <button type="button" onClick={() => setShowDup(v => !v)}>{showDup ? '닫기' : '보기'}</button></>
                    : '겹치는 태그는 없었어요'}
                </div>
              </>)
                : none && <p className="pr-none">이 그림에서는 생성 정보를 찾지 못했어요.<br />NovelAI에서 받은 <b>원본 파일</b>을 넣어 주세요 — 사이트·SNS에 올렸던 그림은 정보가 지워져 있어요.</p>}
          </div>
        </div>
      )}

      {info && (<>
        {info.chars.length > 0 && (
          <div className="pr-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 0} className={tab === 0 ? 'on' : ''} onClick={() => setTab(0)}>베이스</button>
            {info.chars.map((c, i) => (
              <button key={i} type="button" role="tab" aria-selected={tab === i + 1} className={tab === i + 1 ? 'on' : ''} onClick={() => setTab(i + 1)}>
                캐릭터 {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="pr-body">
          {!ch ? (<>
            {info.base ? <PromptBlock label="PROMPT" text={info.base} full copyLabel="베이스 프롬프트" /> : <p className="hint">베이스 프롬프트가 비어 있어요</p>}
            {info.negative && <PromptBlock label="NEGATIVE" text={info.negative} neg full copyLabel="네거티브 프롬프트" />}
          </>) : (<>
            {ch.where && <p className="pr-where">위치 · {ch.where}</p>}
            {ch.pos ? <PromptBlock label="긍정" text={ch.pos} full copyLabel={`캐릭터 ${tab} 긍정 프롬프트`} /> : <p className="hint">긍정 프롬프트가 비어 있어요</p>}
            {ch.neg ? <PromptBlock label="부정" text={ch.neg} neg full copyLabel={`캐릭터 ${tab} 부정 프롬프트`} /> : <p className="hint pr-empty">부정 프롬프트 없음</p>}
          </>)}
        </div>
        {showDup && info.removed.length > 0 && (
          <div className="pr-dups">
            <small>지운 겹치는 태그</small>
            <div>{info.removed.map((t, i) => <s key={i}>{t}</s>)}</div>
          </div>
        )}
        <div className="pr-actions">
          <button type="button" className="btn btn-ghost" onClick={toBackup}>{tab > 0 ? `캐릭터 ${tab}` : '베이스'} 백업에 담기</button>
          <span className="pr-all"><CopyBtn text={promptInfoText(info)} label="프롬프트 전부" caption="전부 복사" /></span>
        </div>
      </>)}
    </div>
  );
}
