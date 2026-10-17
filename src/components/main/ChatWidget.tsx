'use client';
// 메시지창 꾸미기 위젯 (사용자 요청) — 아이메시지 · 카카오톡 · 라인 · 기본 문자 모양.
// 대화 내용(상대/나/날짜 구분선)과 상대 이름·사진은 관리자가 자유롭게 정한다 — 위젯을 누르거나 편집모드 우클릭 「설정」.
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea, KCheck } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

export type ChatTheme = 'imessage' | 'kakao' | 'line' | 'sms';
export interface ChatMsg { id: string; side: 'me' | 'them' | 'date'; text: string; time?: string }
export interface ChatSettings {
  theme?: ChatTheme;
  name?: string;          // 상대 이름 (채팅방 이름)
  avatar?: string;        // 상대 사진 (putBlob 참조)
  msgs?: ChatMsg[];
  read?: boolean;         // 내 마지막 말에 읽음 표시
}

export const CHAT_THEMES: [ChatTheme, string][] = [
  ['imessage', '아이메시지'], ['kakao', '카카오톡'], ['line', '라인'], ['sms', '기본 문자'],
];

const DEMO: ChatMsg[] = [
  { id: 'd0', side: 'date', text: '오늘' },
  { id: 'd1', side: 'them', text: '봄 오면 같이 꽃 보러 가자', time: '오후 9:12' },
  { id: 'd2', side: 'them', text: '벚꽃 필 때쯤!', time: '오후 9:12' },
  { id: 'd3', side: 'me', text: '좋아 🌸', time: '오후 9:14' },
  { id: 'd4', side: 'me', text: '약속한 거다?', time: '오후 9:14' },
];

const uid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/** 상대 프로필 — 사진이 없으면 이름 첫 글자 */
function Avatar({ src, name, cls }: { src?: string; name: string; cls: string }) {
  return (
    <span className={cls}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" />
        : <i>{(name || '?').slice(0, 1)}</i>}
    </span>
  );
}

/** 테마별 헤더 아이콘 (선 아이콘) */
const Back = () => (
  <svg viewBox="0 0 24 24" className="cw-ico" aria-hidden><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Menu = () => (
  <svg viewBox="0 0 24 24" className="cw-ico" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Search = () => (
  <svg viewBox="0 0 24 24" className="cw-ico" aria-hidden><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = () => (
  <svg viewBox="0 0 24 24" className="cw-ico" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

export function ChatView({ s }: { s: ChatSettings }) {
  const theme = s.theme ?? 'imessage';
  const name = s.name || (theme === 'kakao' ? '봄' : theme === 'line' ? 'Haru' : '봄이');
  const msgs = s.msgs?.length ? s.msgs : DEMO;
  const avatar = useBlobUrl(s.avatar);
  const lastMe = [...msgs].reverse().find(m => m.side === 'me')?.id;

  const head = {
    imessage: (
      <div className="cw-head">
        <span className="cw-back"><Back /></span>
        <div className="cw-who">
          <Avatar src={avatar} name={name} cls="cw-av" />
          <b>{name} ›</b>
        </div>
        <span className="cw-r" />
      </div>
    ),
    kakao: (
      <div className="cw-head">
        <span className="cw-back"><Back /></span>
        <b className="cw-title">{name}</b>
        <span className="cw-r"><Search /><Menu /></span>
      </div>
    ),
    line: (
      <div className="cw-head">
        <span className="cw-back"><Back /></span>
        <b className="cw-title">{name}</b>
        <span className="cw-r"><Search /><Menu /></span>
      </div>
    ),
    sms: (
      <div className="cw-head">
        <span className="cw-back"><Back /></span>
        <Avatar src={avatar} name={name} cls="cw-av" />
        <b className="cw-title">{name}</b>
        <span className="cw-r"><Menu /></span>
      </div>
    ),
  }[theme];

  const foot = {
    imessage: <div className="cw-foot"><span className="cw-plus"><Plus /></span><span className="cw-field">iMessage</span></div>,
    kakao: <div className="cw-foot"><span className="cw-plus"><Plus /></span><span className="cw-field" /><span className="cw-send">#</span></div>,
    line: <div className="cw-foot"><span className="cw-plus"><Plus /></span><span className="cw-field">Aa</span></div>,
    sms: <div className="cw-foot"><span className="cw-plus"><Plus /></span><span className="cw-field">문자 메시지</span></div>,
  }[theme];

  return (
    <div className={`cw cw-${theme}`}>
      {head}
      <div className="cw-body">
        {msgs.map((m, i) => {
          if (m.side === 'date') return <div key={m.id} className="cw-date"><span>{m.text}</span></div>;
          const prev = msgs[i - 1], next = msgs[i + 1];
          const first = !prev || prev.side !== m.side;          // 같은 사람의 연속 말 중 첫 번째
          const last = !next || next.side !== m.side;            // 마지막 — 꼬리와 시간은 여기에만
          const isMe = m.side === 'me';
          const showAv = !isMe && first && (theme === 'kakao' || theme === 'line');
          return (
            <div key={m.id} className={`cw-row ${isMe ? 'me' : 'them'} ${first ? 'first' : ''} ${last ? 'last' : ''}`}>
              {!isMe && (theme === 'kakao' || theme === 'line') && (
                showAv ? <Avatar src={avatar} name={name} cls="cw-pav" /> : <span className="cw-pav ghost" />
              )}
              <div className="cw-col">
                {showAv && <span className="cw-name">{name}</span>}
                <div className="cw-ln">
                  <div className="cw-bub">{m.text}</div>
                  {(theme === 'kakao' || theme === 'line') && last && (
                    <span className="cw-meta">
                      {isMe && m.id === lastMe && (theme === 'kakao'
                        ? (s.read === false && <em>1</em>)          // 카카오톡 — 안 읽으면 노란 1
                        : (s.read !== false && <em>Read</em>))}
                      {m.time && <small>{m.time}</small>}
                    </span>
                  )}
                </div>
                {theme === 'imessage' && isMe && m.id === lastMe && s.read !== false && <span className="cw-status">읽음</span>}
                {theme === 'sms' && last && m.time && <span className="cw-status">{m.time}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {foot}
    </div>
  );
}

/** 관리 — 테마 · 상대 이름/사진 · 대화 (⠿ 드래그로 순서) */
export function ChatEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const s = conf.settings as ChatSettings;
  const msgs = s.msgs?.length ? s.msgs : DEMO;
  const set = (p: Partial<ChatSettings>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const setMsgs = (next: ChatMsg[]) => set({ msgs: next });
  const patch = (id: string, p: Partial<ChatMsg>) => setMsgs(msgs.map(m => (m.id === id ? { ...m, ...p } : m)));
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useBlobUrl(s.avatar);
  const [busy, setBusy] = useState(false);
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 };
  const now = () => {
    const d = new Date(); const h = d.getHours();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div>
      <div style={row}>
        <span className="cp-lb">테마</span>
        <div className="mini-seg">
          {CHAT_THEMES.map(([t, l]) => (
            <button key={t} type="button" className={(s.theme ?? 'imessage') === t ? 'on' : ''} onClick={() => set({ theme: t })}>{l}</button>
          ))}
        </div>
      </div>
      <div style={row}>
        <span className="cp-lb">상대</span>
        <KInput value={s.name ?? ''} placeholder="이름 (채팅방 이름)" onChange={e => set({ name: e.target.value })} style={{ width: 160 }} />
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
        )}
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }}
          onClick={() => { if (!busy) fileRef.current?.click(); }}>{busy ? '올리는 중…' : s.avatar ? '사진 바꾸기' : '＋ 프로필 사진'}</button>
        {s.avatar && (
          <button type="button" className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => set({ avatar: undefined })}>빼기</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true);
            try { set({ avatar: await putBlob(f) }); } catch (err) { toast(`사진을 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
            setBusy(false);
          }} />
      </div>

      <span className="cp-lb">대화</span>
      <DragList items={msgs} keyOf={m => m.id} onReorder={setMsgs}
        render={m => (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
            <span className="drag-h" style={{ paddingTop: 7 }}>⠿</span>
            <div className="mini-seg" style={{ flexShrink: 0 }}>
              {([['them', '상대'], ['me', '나'], ['date', '날짜']] as const).map(([v, l]) => (
                <button key={v} type="button" className={m.side === v ? 'on' : ''} onClick={() => patch(m.id, { side: v })}>{l}</button>
              ))}
            </div>
            <KTextarea value={m.text} rows={1} style={{ flex: 1, minHeight: 34 }}
              placeholder={m.side === 'date' ? '예: 2026년 4월 1일' : '메시지'}
              onChange={e => patch(m.id, { text: e.target.value })} />
            {m.side !== 'date' && (
              <KInput value={m.time ?? ''} placeholder="시간" style={{ width: 84 }} onChange={e => patch(m.id, { time: e.target.value })} />
            )}
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }}
              onClick={() => setMsgs(msgs.filter(x => x.id !== m.id))}>DELETE</button>
          </div>
        )} />
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => setMsgs([...msgs, { id: uid(), side: 'them', text: '', time: now() }])}>＋ 상대 말</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMsgs([...msgs, { id: uid(), side: 'me', text: '', time: now() }])}>＋ 내 말</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMsgs([...msgs, { id: uid(), side: 'date', text: '오늘' }])}>＋ 날짜</button>
        <span style={{ marginLeft: 'auto' }}>
          <KCheck label="읽음 표시 (카카오톡은 끄면 노란 1)" checked={s.read !== false} onChange={v => set({ read: v })} />
        </span>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>같은 사람이 이어서 보낸 말은 말풍선이 한데 묶이고, 시간은 마지막 말에만 표시됩니다</p>
    </div>
  );
}

export function ChatWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));
  return (
    <div className="cw-wrap" style={{ cursor: isAdmin && !editOn ? 'pointer' : undefined }}
      onClick={e => { if ((e.target as HTMLElement).closest('.modal-ov')) return; if (isAdmin && !editOn) setOpen(true); }}>
      <ChatView s={conf.settings as ChatSettings} />
      <Modal open={open} onClose={() => setOpen(false)} title="메시지창 꾸미기"
        desc="테마 · 상대 이름과 사진 · 대화 내용 — ⠿ 드래그로 순서 조정"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <ChatEditor conf={conf} />}
      </Modal>
    </div>
  );
}
