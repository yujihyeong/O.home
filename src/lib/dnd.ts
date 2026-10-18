// 파일 드래그앤드롭 공용 props (v1.9) — 업로드 버튼·영역 어디든 {...fileDrop(fn)}으로 부착
import type { DragEvent } from 'react';
import { cropFiles } from '@/components/shell/ImageCropper';

export function fileDrop(onFiles: (files: FileList) => void) {
  return {
    onDragOver: (e: DragEvent) => { e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const list = e.dataTransfer.files;
      if (!list || list.length === 0) return;
      // 끌어다 놓은 사진도 자르기 창을 거친다 (사용자 요청) — 놓은 자리의 data-crop 비율로
      const el = e.currentTarget as HTMLElement;
      if (el.closest('[data-nocrop]')) { onFiles(list); return; }
      const hint = el.closest<HTMLElement>('[data-crop]')?.dataset.crop;
      void cropFiles(Array.from(list), hint).then(out => {
        if (!out) return;
        try { const dt = new DataTransfer(); out.forEach(f => dt.items.add(f)); onFiles(dt.files); } catch { onFiles(list); }
      });
    },
  };
}
