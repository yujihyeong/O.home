'use client';
// 자체 토스트 (7장)
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ToastItem { id: number; text: string; top?: boolean }
/** top: 화면 위쪽에 짧게 잠깐 (예: 이미지 메타데이터를 지웠다는 알림 — 사용자 요청) */
export interface ToastOpts { top?: boolean }
const Ctx = createContext<(text: string, opts?: ToastOpts) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: string, opts?: ToastOpts) => {
    const id = ++seq.current;
    setItems(list => [...list, { id, text, top: opts?.top }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), opts?.top ? 1800 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-box">
        {items.filter(t => !t.top).map(t => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
      <div className="toast-box top">
        {items.filter(t => t.top).map(t => <div key={t.id} className="toast top">{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
