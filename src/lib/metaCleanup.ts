// 예전에 올린 이미지들의 메타데이터 지우기 (사용자 요청 — 「지금 올라간 애들도 알아서 지워」).
// 메타데이터 지우기를 고치기 전(픽셀 속 NovelAI 정보·아이폰 끝 사진 등이 남던 때)에 올라간 이미지를
// 저장소에서 하나씩 받아 다시 지우고, **같은 주소에 덮어쓴다** — 글·설정 속 주소를 고칠 필요가 없다.
// 저장소를 덮어쓸 권한은 관리자에게만 있어서, 관리자가 홈에 들어왔을 때 한 번 저절로 돈다.
import type { Backend } from './backend/types';
import { stripImageMetaInfo } from './imageMeta';

export const META_CLEAN_KEY = 'ohome.metaClean.v2';
const IMG = /\.(png|jpe?g|webp|gif)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export interface MetaCleanResult { total: number; cleaned: number; failed: number }

export async function cleanStoredImages(be: Backend, onProgress?: (done: number, total: number) => void): Promise<MetaCleanResult> {
  if (!be.readFile || !be.replaceFile) return { total: 0, cleaned: 0, failed: 0 };
  const files = (await be.listFiles()).filter(f => IMG.test(f.ref.split('?')[0]));
  let cleaned = 0, failed = 0;
  for (let k = 0; k < files.length; k++) {
    const ref = files[k].ref;
    try {
      const raw = await be.readFile(ref);
      if (raw) {
        const ext = (ref.split('?')[0].match(IMG)?.[1] ?? '').toLowerCase();
        const typed = raw.type.startsWith('image/') ? raw : new Blob([raw], { type: MIME[ext] ?? 'image/png' });
        const r = await stripImageMetaInfo(typed);
        if (r.removed && r.blob !== typed) { await be.replaceFile(ref, r.blob); cleaned += 1; }
      }
    } catch { failed += 1; }
    onProgress?.(k + 1, files.length);
  }
  return { total: files.length, cleaned, failed };
}
