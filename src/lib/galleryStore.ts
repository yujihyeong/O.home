// 그림 로드뷰(4.10)·그림백업(4.11) 데이터 — localStorage (→ Supabase/R2 이전 예정)
import type { Comment, FoldType } from './postStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';

/* ---------- 로드뷰 (4.10) ---------- */
export interface RoadItem {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  author: string;
  authorId: string;
  date: string;              // ISO
  imgUrl?: string;           // (구) URL — 새 업로드는 imgId 사용
  imgId?: string;            // IndexedDB 파일 id (blobStore — 새로고침에도 유지)
  ph: string;                // 데모 플레이스홀더 클래스
  narrow?: boolean;          // 원본 가로가 좁은 이미지 (가운데 정렬)
  ratio: string;             // aspect-ratio 값
  fold: { type: FoldType; label?: string } | null;
  comments: Comment[];
  no?: number;               // 그림 번호 (v1.9 — 제목 대신 번호로 식별, 알림도 번호 기준)
}

export const ROAD_SEED: RoadItem[] = [];

/* ---------- 그림백업 (4.11) ---------- */
export interface BackupPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  type: 'log' | 'single' | 'vlist';    // 로그형(틈 없이 세로) / 단일형(좌우 넘김) / 단일 세로정렬(갭 있는 세로, v1.9)
  images: string[];          // 파일 id 또는 URL (비어 있으면 데모 ph — blobStore 참조)
  thumbCrop?: CropValue;     // 대표(첫) 이미지의 썸네일 크롭 (6.1)
  phList: string[];          // 데모 플레이스홀더
  desc: string;
  category: string;          // 말머리
  madeDate?: string;         // 제작일 (선택)
  date: string;
  author: string;
  authorId: string;
  visibility: Visibility;
  fold: { type: FoldType; label?: string } | null;
  /** 태그 (v2.0 사용자 요청) — 목록·카드에 나열되고 검색에 걸린다 */
  tags?: string[];
}

export const BACKUP_SEED: BackupPost[] = [];

export const BACKUP_CATEGORIES = ['합작', '낙서', '커미션', '설정화'];
