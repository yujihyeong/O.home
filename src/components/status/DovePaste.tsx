'use client';
// 도브(본서사) 트래커 붙여넣기 (사용자 요청) — 로판 AI 트래커를 통째로 복사해 이 칸에 붙여 넣으면
// 글 맨 밑의 <DOVE> … </DOVE> 자리에 들어가고(있으면 바꾸고), 보여 줄 때 DOVSI ARCHIVE 카드가 된다.
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { KTextarea } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { withDoveTracker } from '@/lib/statusCard';
import { parseDove } from './DoveCard';

export function DovePaste({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) setText(t);
      else toast('클립보드가 비어 있어요');
    } catch { toast('칸을 길게 눌러 붙여넣기 해 주세요'); }
  };
  const apply = () => {
    if (!text.trim()) { toast('트래커를 붙여 넣어 주세요'); return; }
    const n = Object.keys(parseDove(text)).length;
    if (!n) { toast('트래커 항목을 찾지 못했어요 — 계절·날짜·상황… 부분을 통째로 복사해 주세요'); return; }
    onChange(withDoveTracker(value, text));
    setOpen(false); setText('');
    toast(`상태창을 넣었어요 (${n}개 항목)`);
  };
  return (
    <>
      <div className="dove-bar">
        <button type="button" className="btn btn-dark" onClick={() => setOpen(true)}>트래커 붙여넣기</button>
        <span>로판 트래커를 통째로 복사해 붙여 넣으면 글 맨 밑에 상태창이 생겨요</span>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="도브(본서사) 트래커"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={apply}>넣기</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <button type="button" className="btn btn-ghost" onClick={fromClipboard}>복사한 트래커 가져오기</button>
          <KTextarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 220 }}
            placeholder={'계절\n☃️☀️ · 135\n날짜\n2025.12.01 (월) · 09:05\n상황\n…'} />
        </div>
      </Modal>
    </>
  );
}
