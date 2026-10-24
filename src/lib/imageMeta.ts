// 이미지 메타데이터 지우기 (보안 강화) — 올리기 전에 브라우저 안에서.
// 사진에는 찍은 위치(GPS)·기기·날짜, 생성 이미지에는 프롬프트·도구 정보 같은 것이 숨어 있다.
// 공개 주소로 올라가면 누구나 내려받아 그대로 읽을 수 있으므로, 그림 자체는 건드리지 않고(재압축 없음)
// 메타데이터 덩어리만 잘라 낸다.
//   · JPEG: EXIF·XMP(APP1), IPTC(APP13), 주석(COM) 제거 — 회전 정보만 최소 EXIF로 다시 넣는다(안 그러면 사진이 눕는다)
//   · PNG : tEXt·zTXt·iTXt(생성 정보·프롬프트), eXIf, tIME 제거
//   · WebP: EXIF·XMP 청크 제거 + VP8X 표시 정리
//   · GIF : 주석(Comment) 확장·XMP 등 응용 확장 제거 — 반복 재생 정보(NETSCAPE2.0)는 남긴다(안 그러면 움짤이 멈춘다)
// 색 정보(ICC)는 남긴다 — 개인정보가 아니고, 지우면 색이 달라 보인다.
// 다른 형식이거나 읽다가 이상하면 원본을 그대로 돌려준다(올리기를 막지 않는다).

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** EXIF(APP1 본문)에서 회전값(0x0112)만 읽는다 — 없으면 1 */
function exifOrientation(seg: Uint8Array): number {
  // seg = "Exif\0\0" + TIFF
  if (seg.length < 14 || String.fromCharCode(...seg.slice(0, 4)) !== 'Exif') return 1;
  const t = 6;
  const le = seg[t] === 0x49;
  const r16 = (i: number) => (le ? seg[t + i] | (seg[t + i + 1] << 8) : (seg[t + i] << 8) | seg[t + i + 1]);
  const r32 = (i: number) => (le
    ? (seg[t + i] | (seg[t + i + 1] << 8) | (seg[t + i + 2] << 16) | (seg[t + i + 3] << 24)) >>> 0
    : u32be(seg, t + i));
  const ifd = r32(4);
  if (t + ifd + 2 > seg.length) return 1;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (t + e + 12 > seg.length) break;
    if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

/** 회전값 하나만 든 최소 EXIF(APP1) 세그먼트 */
function orientationApp1(o: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,   // 빅엔디언 TIFF, IFD0 = 8
    0x00, 0x01,                                         // 항목 1개
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,     // Orientation, SHORT, 1개
    0x00, o, 0x00, 0x00,                                // 값
    0x00, 0x00, 0x00, 0x00,                             // 다음 IFD 없음
  ];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];   // "Exif\0\0"
  const len = body.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const keep: Uint8Array[] = [b.slice(0, 2)];
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xda) { keep.push(b.slice(i)); break; }          // 화상 데이터 시작 — 나머지는 그대로
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { keep.push(b.slice(i, i + 2)); i += 2; continue; }
    const len = u16be(b, i + 2);
    const seg = b.slice(i, i + 2 + len);
    const isApp1 = m === 0xe1;
    if (isApp1) orientation = Math.max(orientation, exifOrientation(b.slice(i + 4, i + 2 + len)));
    // 버린다: APP1(EXIF·XMP) · APP13(IPTC) · COM — 나머지(JFIF·ICC·Adobe·양자화표 등)는 그대로
    if (!(isApp1 || m === 0xed || m === 0xfe)) keep.push(seg);
    i += 2 + len;
  }
  if (orientation !== 1) keep.splice(1, 0, orientationApp1(orientation));
  return concat(keep);
}

function stripPng(b: Uint8Array): Uint8Array | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, k) => b[k] === v)) return null;
  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const keep: Uint8Array[] = [b.slice(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (!drop.has(type)) keep.push(b.slice(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(keep);
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  if (String.fromCharCode(...b.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...b.slice(8, 12)) !== 'WEBP') return null;
  const keep: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const len = u32le(b, i + 4);
    const end = i + 8 + len + (len & 1);
    if (end > b.length + 1) return null;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04);   // EXIF·XMP 있음 표시 끄기
      keep.push(chunk);
    }
    i = end;
  }
  const body = concat(keep);
  const head = new Uint8Array(12);
  head.set(b.slice(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff; head[5] = (size >> 8) & 0xff; head[6] = (size >> 16) & 0xff; head[7] = (size >>> 24) & 0xff;
  return concat([head, body]);
}

function stripGif(b: Uint8Array): Uint8Array | null {
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  /** 0으로 끝나는 하위 블록들의 끝 위치 */
  const skipSub = (i: number) => {
    while (i < b.length) { const n = b[i]; i += 1 + n; if (n === 0) return i; }
    return -1;
  };
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 0x07) + 1));      // 전체 색표
  const keep: Uint8Array[] = [b.slice(0, i)];
  while (i < b.length) {
    const t = b[i];
    if (t === 0x3b) { keep.push(b.slice(i, i + 1)); return concat(keep); }   // 끝
    if (t === 0x2c) {                                                      // 그림 한 장
      let j = i + 10;
      if (b[i + 9] & 0x80) j += 3 * (1 << ((b[i + 9] & 0x07) + 1));       // 그 장의 색표
      j = skipSub(j + 1);                                                  // LZW 크기 1바이트 + 데이터
      if (j < 0) return null;
      keep.push(b.slice(i, j)); i = j; continue;
    }
    if (t === 0x21) {                                                      // 확장
      const label = b[i + 1];
      const j = skipSub(i + 2);
      if (j < 0) return null;
      const app = label === 0xff ? String.fromCharCode(...b.slice(i + 3, i + 14)) : '';
      // 버린다: 주석(0xFE) · 반복 정보가 아닌 응용 확장(XMP 등). 그림 제어(0xF9)·글자(0x01)·반복 정보는 남긴다
      const drop = label === 0xfe || (label === 0xff && app !== 'NETSCAPE2.0' && app !== 'ANIMEXTS1.0');
      if (!drop) keep.push(b.slice(i, j));
      i = j; continue;
    }
    return null;   // 모르는 블록 — 건드리지 않는다
  }
  return null;
}

/** 메타데이터를 지운 이미지 — 이미지가 아니거나 모르는 형식이면 그대로 */
export async function stripImageMeta<T extends Blob>(blob: T): Promise<T | Blob> {
  return (await stripImageMetaInfo(blob)).blob;
}

/* 자르기 창(ImageCropper)을 거친 사진은 그림을 다시 그려 저장하므로 메타데이터가 이미 사라진 채로 온다.
   그래도 「지웠어요」 알림을 띄울 수 있게, 원본에 메타데이터가 있었던 결과물을 표시해 둔다 */
const hadMeta = new WeakSet<Blob>();
export function markHadMeta(b: Blob) { hadMeta.add(b); }

/** 지우고, 실제로 지운 게 있었는지도 알려 준다 — 글쓰기에서 「메타데이터를 지웠어요」 알림용 (사용자 요청) */
export async function stripImageMetaInfo<T extends Blob>(blob: T): Promise<{ blob: T | Blob; removed: boolean }> {
  if (hadMeta.has(blob)) return { blob, removed: true };
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(blob.type)) return { blob, removed: false };
  try {
    const b = new Uint8Array(await blob.arrayBuffer());
    const t = blob.type.toLowerCase();
    const out = t.includes('png') ? stripPng(b) : t.includes('webp') ? stripWebp(b) : t.includes('gif') ? stripGif(b) : stripJpeg(b);
    if (!out || out.length === b.length) return { blob, removed: false };
    const clean = new Blob([out as BlobPart], { type: blob.type });
    // 파일이면 이름을 지킨다 (원본 파일명 표시 등)
    return {
      blob: typeof File !== 'undefined' && blob instanceof File
        ? new File([clean], blob.name, { type: blob.type, lastModified: 0 })
        : clean,
      removed: true,
    };
  } catch {
    return { blob, removed: false };
  }
}
