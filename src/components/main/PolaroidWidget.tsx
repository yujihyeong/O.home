'use client';
// 폴라로이드 스택 위젯 (사용자 요청) — 사진 여러 장을 비뚤게 겹쳐 두고, 누르면 맨 앞 장이 날아가며 다음 장이 앞으로.
// 사진 아래 여백에 손글씨 메모(캡션). 사진·캡션·순서·캡션 글씨체·테이프는 관리자가 정한다.
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KSelect, KCheck } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useFonts } from '@/lib/fontStore';
import { useToast } from '@/components/ui/Toast';

export interface PolaroidPhoto { id: string; img: string; cap?: string }

const uid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 사진이 없을 때 보이는 빈 폴라로이드 (색만)
const EMPTY = ['linear-gradient(150deg,#c9dbb2,#f1ead2)', 'linear-gradient(160deg,#bcd6ea,#e3eef6)', 'linear-gradient(135deg,#f5c9cf,#f9e4c6)'];

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

function Shot({ img, bg }: { img?: string; bg?: string }) {
  const src = useBlobUrl(img);
  return (
    <p className="pl-img" style={bg ? { background: bg } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" draggable={false} />}
    </p>
  );
}

export function PolaroidWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const { familyOf } = useFonts();
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));
  const photos = ((conf.settings.photos as PolaroidPhoto[]) ?? []).filter(p => p.img);
  const tape = conf.settings.tape !== false;
  const capFont = familyOf((conf.settings.fontId as string) || 'dancing');
  const [cur, setCur] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const n = photos.length;
  useEffect(() => { if (cur >= n && n) setCur(0); }, [cur, n]);

  // 앞에서부터 최대 3장 — 뒤 장은 살짝 비켜서 기울어진다
  const cards = n
    ? Array.from({ length: Math.min(3, n) }, (_, d) => ({ d, p: photos[(cur + d) % n] as PolaroidPhoto | undefined }))
    : EMPTY.map((bg, d) => ({ d, p: undefined, bg }));
  const next = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-ov')) return;
    if (editOn || n < 2 || leaving) return;
    setLeaving(true);
    setTimeout(() => { setCur(c => (c + 1) % n); setLeaving(false); }, 380);
  };

  return (
    <div className="pl-wrap" onClick={next} style={{ cursor: !editOn && n > 1 ? 'var(--cur-pointer,pointer)' : undefined }}>
      {[...cards].reverse().map(c => (
        <div key={c.p?.id ?? `e${c.d}`}
          className={`pl-card d${c.d} ${c.d === 0 && leaving ? 'out' : ''}`}>
          <Shot img={c.p?.img} bg={'bg' in c ? (c.bg as string) : undefined} />
          <span className="pl-cap" style={{ fontFamily: capFont }}>{c.p?.cap ?? ''}</span>
          {tape && c.d === 0 && <i className="pl-tape" />}
        </div>
      ))}
      {isAdmin && !editOn && (
        <button type="button" className="pl-set" onClick={e => { e.stopPropagation(); setOpen(true); }}>
          {n ? '설정' : '＋ 사진 넣기'}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="폴라로이드"
        desc="사진과 손글씨 메모 — ⠿ 드래그로 순서 조정, 위젯을 누르면 한 장씩 넘어가요"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <PolaroidEditor conf={conf} />}
      </Modal>
    </div>
  );
}

function PhotoRow({ p, patch, del }: { p: PolaroidPhoto; patch: (x: Partial<PolaroidPhoto>) => void; del: () => void }) {
  const src = useBlobUrl(p.img);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      <span className="drag-h">⠿</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} /> : <span style={{ width: 42, height: 42, flexShrink: 0 }} />}
      <KInput value={p.cap ?? ''} placeholder="손글씨 메모 (선택)" style={{ flex: 1 }} onChange={e => patch({ cap: e.target.value })} />
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }} onClick={del}>DELETE</button>
    </div>
  );
}

export function PolaroidEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const { fonts, familyOf } = useFonts();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photos = (conf.settings.photos as PolaroidPhoto[]) ?? [];
  const set = (p: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const setPhotos = (next: PolaroidPhoto[]) => set({ photos: next });
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 };

  return (
    <div>
      <div style={row}>
        <span className="cp-lb">메모 글씨체</span>
        <KSelect minWidth={170} value={(conf.settings.fontId as string) || 'dancing'}
          onChange={v => set({ fontId: v })}
          options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
        <KCheck label="맨 앞 장에 테이프" checked={conf.settings.tape !== false} onChange={v => set({ tape: v })} />
      </div>
      <span className="cp-lb">사진</span>
      {photos.length === 0 && <p className="hint" style={{ margin: '6px 0' }}>아직 사진이 없어요 — 여러 장을 한꺼번에 골라도 돼요</p>}
      <DragList items={photos} keyOf={p => p.id} onReorder={setPhotos}
        render={p => (
          <PhotoRow p={p}
            patch={x => setPhotos(photos.map(y => (y.id === p.id ? { ...y, ...x } : y)))}
            del={() => setPhotos(photos.filter(y => y.id !== p.id))} />
        )} />
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
        onClick={() => { if (!busy) fileRef.current?.click(); }}>{busy ? '올리는 중…' : '＋ 사진 추가'}</button>
      <input data-crop="1:1" ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          const files = [...(e.target.files ?? [])]; e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          const added: PolaroidPhoto[] = [];
          for (const f of files) {
            try { added.push({ id: uid(), img: await putBlob(f) }); } catch (err) { toast(`사진을 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          }
          if (added.length) setPhotos([...photos, ...added]);
          setBusy(false);
        }} />
    </div>
  );
}
