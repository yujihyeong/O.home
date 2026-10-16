'use client';
/**
 * 주소 쿼리 읽기 — 직접 지은 짧은 주소(/LOG 등)에서도 페이지가 제 게시판·섹션을 알 수 있게 (사용자 요청).
 *
 * 짧은 주소는 주소창에 그대로 두고(`/LOG`), 그 자리에서 실제 페이지(`/board?b=…`)를 그린다.
 * 그 페이지들은 원래 주소의 `?b=`·`?s=`를 읽어 어떤 게시판·섹션인지 정하는데, 주소창에는 그게 없으니
 * 여기서 대신 넣어 준다. 짧은 주소가 아니면 평소처럼 실제 주소의 쿼리를 그대로 쓴다.
 */
import React, { createContext, useContext } from 'react';
import { useSearchParams } from 'next/navigation';

const Ctx = createContext<URLSearchParams | null>(null);

/** useSearchParams 대신 — 짧은 주소 안에서는 연결된 페이지의 쿼리를 돌려준다 */
export function useRouteSearch(): URLSearchParams {
  const real = useSearchParams();
  const forced = useContext(Ctx);
  return forced ?? (real as unknown as URLSearchParams);
}

export function RouteSearchProvider({ search, children }: { search: string; children: React.ReactNode }) {
  return <Ctx.Provider value={new URLSearchParams(search)}>{children}</Ctx.Provider>;
}
