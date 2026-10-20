// 오늘의 운세 위젯 (사용자 요청) — 방문자 IP + 오늘 날짜(한국 시간)로 정해지는 씨앗.
// 같은 IP는 하루 종일 같은 카드·같은 문장만 나오니, 저장해 둔 기록을 지워도 다시 뽑을 수 없다.
// IP는 해시로만 쓰고 돌려주지도 저장하지도 않는다.
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const h = req.headers;
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const seed = createHash('sha256').update(`${ip}|${date}|ohome-fortune`).digest('hex').slice(0, 12);
  return Response.json({ date, seed }, { headers: { 'cache-control': 'private, no-store' } });
}
