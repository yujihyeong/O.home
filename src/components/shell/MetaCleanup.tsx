'use client';
// 예전에 올린 이미지 메타데이터 정리 — 관리자가 홈에 들어오면 한 번 저절로 (lib/metaCleanup)
import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { backend, isServerMode } from '@/lib/backend';
import { cleanStoredImages, META_CLEAN_KEY } from '@/lib/metaCleanup';
import { useToast } from '@/components/ui/Toast';

const LOCK = 'ohome.metaClean.lock';

export function MetaCleanup() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const ran = useRef(false);
  const uid = user?.id;
  useEffect(() => {
    if (!isAdmin || !uid || ran.current || !isServerMode()) return;
    const be = backend();
    if (!be?.readFile || !be.replaceFile) return;
    ran.current = true;
    (async () => {
      try {
        if (await be.fetchSetting(META_CLEAN_KEY)) return;          // 이미 했다
        // 탭 여러 개가 동시에 돌지 않게 (10분 잠금)
        const lock = Number(localStorage.getItem(LOCK) || 0);
        if (Date.now() - lock < 10 * 60_000) return;
        localStorage.setItem(LOCK, String(Date.now()));
        toast('예전에 올린 이미지의 숨은 정보를 지우는 중이에요 — 잠시 이 창을 닫지 말아 주세요');
        const r = await cleanStoredImages(be);
        if (r.failed === 0) await be.saveSetting(META_CLEAN_KEY, { at: new Date().toISOString(), ...r });
        localStorage.removeItem(LOCK);
        toast(r.failed
          ? `이미지 ${r.total}장 중 ${r.cleaned}장 정리 · ${r.failed}장은 실패 — 다음에 들어오면 다시 시도해요`
          : `예전 이미지 ${r.total}장을 모두 확인했어요 · ${r.cleaned}장에서 숨은 정보를 지웠어요`);
      } catch {
        ran.current = false;
        try { localStorage.removeItem(LOCK); } catch { /* 무시 */ }
      }
    })();
  }, [isAdmin, uid, toast]);
  return null;
}
