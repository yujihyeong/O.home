'use client';
// 설치 화면에서 복사해 쓰는 스키마 SQL — 원본: supabase/schema.sql
// (원본을 고치면 이 파일도 함께 갱신)

export const SCHEMA_SQL = `-- ============================================================
-- O.HOME 서버 스키마 (공개 홈용)
-- Supabase → SQL Editor 에 통째로 붙여넣고 [Run].
-- 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
-- ============================================================

-- ── 1. 회원 프로필 ───────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  avatar_url text,
  avatar_color text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
-- 가입 승인 (사용자 요청) — 새 가입자는 관리자가 수락해야 회원이 된다. 이미 있던 회원은 그대로 승인 상태
alter table public.profiles add column if not exists approved boolean not null default true;
-- 가입할 때 적은 트위터 아이디 (사용자 요청 — 이메일 대신)
alter table public.profiles add column if not exists twitter text;

-- ── 2. 가입코드 (초대코드 방식) ──────────────────────────────
create table if not exists public.invite_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id),
  used_at timestamptz
);

-- ── 3. 사이트 설정 (테마·폰트·메뉴·메인 위젯·게시판 설정 등) ──
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── 3b. 비공개 설정 (보안 강화) — 가입코드처럼 방문자에게 보이면 안 되는 값 ─────
-- site_settings는 누구나 읽는다(테마·메뉴를 그려야 하므로). 가입코드가 거기 있으면 F12로 그대로 보였다.
-- 이 표는 관리자만 읽고 쓴다 — 가입 검사는 아래 handle_new_user가 서버 안에서 한다.
create table if not exists public.private_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ── 3c. 회원 전용 비밀값 (사용자 요청) — 매달 바뀌는 자동 비밀번호의 열쇠.
-- 로그인한(승인된) 회원은 자동 비밀번호 글·게시판을 비밀번호 없이 연다. 방문자는 못 읽고, 관리자만 쓴다.
-- (관리자가 직접 정한 비밀번호의 열쇠는 여기 두지 않는다 — 그건 비밀번호를 아는 사람만)
create table if not exists public.member_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ── 4. 관리자 판별 함수 ──────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- 승인된 회원인지 (가입 승인 — 사용자 요청). 승인 전 계정은 로그인해도 멤버공개 글을 못 읽고 못 쓴다
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)
$$;

-- ── 5. 가입 시 프로필 자동 생성 (첫 가입자 = 관리자) ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing int; need text;
begin
  select count(*) into existing from public.profiles;
  -- 가입코드는 서버에서 검사한다 (보안 강화) — 예전엔 화면에서만 비교해서,
  -- 콘솔에서 가입 API를 직접 부르면 코드 없이도 회원이 될 수 있었다. 첫 계정(관리자)은 예외
  if existing > 0 then
    select value into need from public.private_settings where key = 'invite';
    if coalesce(new.raw_user_meta_data->>'invite', '') <> coalesce(nullif(need, ''), 'WELCOME') then
      raise exception 'invalid invite code';
    end if;
  end if;
  -- 첫 계정(관리자)만 바로 승인, 나머지는 관리자가 수락할 때까지 대기
  insert into public.profiles (id, nickname, role, approved, twitter)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    case when existing = 0 then 'admin' else 'member' end,
    existing = 0,
    nullif(new.raw_user_meta_data->>'twitter', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 5b. 프로필 권한(role) 서버 잠금 (v2.0 보안 — 관리자 탈취 방지) ───────────
-- RLS의 profiles_update_own은 「자기 행인지」만 보고 바뀐 role 값은 검사하지 않았다.
-- 그래서 로그인한 누구나 콘솔에서  update profiles set role='admin' 한 줄로 관리자가 될 수 있었다.
-- 이 트리거가 서버에서 role을 고정한다(RLS로는 컬럼 단위 제어가 안 되므로 트리거가 확실하다):
--   · 기존 관리자(is_admin)는 회원 권한을 자유롭게 바꿀 수 있다
--   · 그 외에는 수정으로 role을 절대 못 바꾸고(old 값 유지),
--     신규 프로필은 관리자가 하나도 없을 때(최초 소유자 부트스트랩 = handle_new_user)만 admin 허용 —
--     이후의 모든 가입은 콘솔로 role='admin'을 넣어도 member로 고정된다.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_count int;
begin
  if public.is_admin() then
    return new;                                   -- 관리자는 권한 관리 허용
  end if;
  if tg_op = 'UPDATE' then
    new.role := old.role;                         -- 수정으로는 role 변경 불가
    new.approved := old.approved;                 -- 가입 승인도 관리자만
  else
    select count(*) into admin_count from public.profiles where role = 'admin';
    if admin_count > 0 then
      new.role := 'member';                       -- 관리자가 이미 있으면 신규는 member 고정
      new.approved := false;                      -- 신규는 승인 대기
    end if;                                       -- (admin_count = 0 일 때만 최초 소유자 admin 통과)
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- ── 6. 콘텐츠 테이블 21종 ────────────────────────────────────
-- 항목 하나 = 행 하나 (행 단위 권한·실시간). 항목의 세부 필드는 data(jsonb)에 담고,
-- 권한·정렬·필터에 쓰는 값만 별도 컬럼으로 뽑아 둔다.
do $$
declare t text;
declare content_tables text[] := array[
  'posts',        -- 게시판 글
  'guestbook',    -- 방명록
  'characters',   -- 캐릭터
  'relations',    -- 자관
  'gallery',      -- 그림 백업(갤러리)
  'roadview',     -- 로드뷰
  'trpg_logs',        -- TRPG 로그(목록 문서 — 본문 제외)
  'trpg_log_bodies',  -- TRPG 로그 본문 (v2.0, 목록과 분리 저장 — 나만보기 로그의 본문 보호용)
  'trpg_chars',   -- TRPG 캐릭터
  'dotori',       -- 도토리
  'playlog',      -- 플레이기록
  'rp_rooms',     -- 역극 방
  'threads',      -- 감상타래
  'diary',        -- 다이어리
  'memos',        -- 스티커 메모
  'commissions',  -- 커미션
  'applicants',   -- 신청자
  'moods',        -- 무드 목록
  'comments',     -- 댓글 (v2.0 — 글 안이 아니라 자기 행으로. 글을 수정하지 않고 댓글을 달 수 있게)
  'qa_answers',   -- 자관 문답 답변 (v2.0 — 같은 이유로 자관 안이 아니라 자기 행으로)
  'rp_messages',  -- 역극 발화 (v2.0 — 같은 이유로 방 안이 아니라 자기 행으로)
  'notifications', -- 알림 (v2.0 — 기기 보관이던 것을 서버로: 받은 사람 계정으로 어느 기기에서나)
  'push_subs'     -- 웹푸시 기기 구독 (자놀 이식 — 회원마다 기기별 한 문서, 공개범위 member)
];
begin
  foreach t in array content_tables loop
    execute format($f$
      create table if not exists public.%I (
        id          text primary key,
        data        jsonb not null default '{}'::jsonb,
        author_id   uuid references auth.users(id) on delete set null,
        visibility  text not null default 'public',
        sort        double precision not null default 0,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )$f$, t);

    -- 편집 권한을 받은 회원 (v2.0) — 캐릭터 grants의 「편집까지」 대상. 이미 만든 테이블에도 붙는다
    execute format($f$
      alter table public.%I add column if not exists editor_ids text[] not null default '{}'::text[]
    $f$, t);

    -- 비공개여도 읽을 수 있는 회원 (보안 강화) — 비밀글에 달린 댓글을 그 글 작성자가 볼 수 있게
    execute format($f$
      alter table public.%I add column if not exists reader_ids text[] not null default '{}'::text[]
    $f$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (sort)', t || '_sort_idx', t);

    -- 읽기: 전체공개 / 멤버공개(로그인) / 본인 글 / 관리자
    execute format('drop policy if exists "read" on public.%I', t);
    execute format($p$
      create policy "read" on public.%I for select using (
        visibility = 'public'
        or (visibility = 'member' and public.is_member())
        or author_id = auth.uid()
        or auth.uid()::text = any(reader_ids)
        or public.is_admin()
      )$p$, t);

    -- 쓰기: 로그인 회원 (방명록만 아래에서 비로그인 허용으로 덮어씀)
    execute format('drop policy if exists "insert" on public.%I', t);
    -- 남의 이름(author_id)으로는 못 쓴다 (보안 강화) — 예전엔 아무 값이나 넣을 수 있었다.
    -- 편집 권한을 받은 회원(editor_ids)은 통과 — 저장이 upsert라 수정할 때도 이 검사를 거친다
    execute format($p$
      create policy "insert" on public.%I for insert to authenticated
        with check (public.is_admin() or (public.is_member() and (author_id is null or author_id = auth.uid()
                    or auth.uid()::text = any(editor_ids))))$p$, t);

    -- 수정·삭제: 본인 · 편집 권한을 받은 회원(editor_ids) · 관리자
    execute format('drop policy if exists "update" on public.%I', t);
    execute format($p$
      create policy "update" on public.%I for update to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))
        with check (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);

    execute format('drop policy if exists "delete" on public.%I', t);
    execute format($p$
      create policy "delete" on public.%I for delete to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);
  end loop;
end $$;

-- 방명록·게시판 댓글은 비로그인 방문자도 남길 수 있음 (닉네임+비밀번호 방식)
drop policy if exists "insert" on public.guestbook;
create policy "insert" on public.guestbook for insert
  with check (author_id is null or author_id = auth.uid() or public.is_admin());

-- 댓글도 비로그인 방문자가 남길 수 있다 (닉네임+비밀번호 방식 — 방명록과 동일, v2.0).
-- 수정·삭제는 위 공통 정책 그대로: 작성자 본인 또는 관리자.
drop policy if exists "insert" on public.comments;
create policy "insert" on public.comments for insert
  with check (author_id is null or author_id = auth.uid() or public.is_admin());

-- 알림도 비로그인 방문자가 만들 수 있다 (v2.0) — 손님 댓글·방명록이 관리자에게 알림을 남겨야 하므로.
-- 행의 주인(author_id)은 받는 사람이라, 읽기·수정·삭제는 받는 사람과 관리자만 (공통 정책 그대로).
drop policy if exists "insert" on public.notifications;
create policy "insert" on public.notifications for insert with check (true);

-- ── 7. 사이트 설정 권한 (읽기 공개 · 쓰기 관리자) ────────────
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.site_settings enable row level security;
alter table public.private_settings enable row level security;

alter table public.member_secrets enable row level security;
drop policy if exists "member_secrets_read" on public.member_secrets;
create policy "member_secrets_read" on public.member_secrets for select to authenticated
  using (public.is_member() or public.is_admin());
drop policy if exists "member_secrets_write" on public.member_secrets;
create policy "member_secrets_write" on public.member_secrets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "private_admin" on public.private_settings;
create policy "private_admin" on public.private_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 예전에 공개 설정에 저장돼 있던 가입코드를 비공개 표로 옮기고 공개 쪽은 지운다
insert into public.private_settings (key, value)
  select 'invite', value #>> '{}' from public.site_settings
  where key = 'ohome.invite.v1' and coalesce(value #>> '{}', '') <> ''
on conflict (key) do nothing;
delete from public.site_settings where key = 'ohome.invite.v1';

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());   -- 바뀐 행도 검사 — 남의 행으로 바꿔치기 방지 (role은 위 트리거가 고정)
-- 프로필 저장은 upsert(INSERT 경로)라 INSERT 정책이 없으면 행이 이미 있어도 거부된다
-- ("new row violates row-level security policy" — v2.0 포크 제보). 자기 행만 만들 수 있게 허용.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (auth.uid() = id);
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.is_admin());

-- (옛 초대코드 표 — 지금은 쓰지 않는다) 누구나 읽고 고칠 수 있던 것을 관리자 전용으로 (보안 강화)
drop policy if exists "invite_select" on public.invite_codes;
create policy "invite_select" on public.invite_codes for select to authenticated using (public.is_admin());
drop policy if exists "invite_write" on public.invite_codes;
create policy "invite_write" on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "invite_use" on public.invite_codes;

drop policy if exists "settings_select" on public.site_settings;
create policy "settings_select" on public.site_settings for select using (true);
drop policy if exists "settings_write" on public.site_settings;
create policy "settings_write" on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 8. 이미지 저장소 (Storage 버킷) ──────────────────────────
insert into storage.buckets (id, name, public)
values ('ohome', 'ohome', true)
on conflict (id) do nothing;

-- 파일 목록 조회는 관리자만 (보안 강화) — 예전엔 누구나 저장소 전체 목록을 받아
-- 비공개 글에만 쓰인 이미지 주소까지 찾아낼 수 있었다. 공개 주소로 그림을 보는 것은 그대로 된다
drop policy if exists "ohome_read" on storage.objects;
create policy "ohome_read" on storage.objects for select to authenticated
  using (bucket_id = 'ohome' and public.is_admin());
drop policy if exists "ohome_write" on storage.objects;
create policy "ohome_write" on storage.objects for insert to authenticated with check (bucket_id = 'ohome');
-- 남이 올린 파일을 덮어쓰지 못하게 (보안 강화) — 예전엔 로그인한 누구나 아무 파일이나 바꿀 수 있었다
drop policy if exists "ohome_update" on storage.objects;
create policy "ohome_update" on storage.objects for update to authenticated
  using (bucket_id = 'ohome' and (owner = auth.uid() or public.is_admin()));
drop policy if exists "ohome_delete" on storage.objects;
create policy "ohome_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ohome' and (owner = auth.uid() or public.is_admin()));

-- ── 9. 실시간 (역극·문답 티키타카) ───────────────────────────
do $$
declare t text;
begin
  -- 발화·답변·댓글이 각자 행으로 분리됐으므로(v2.0) 실시간도 그 테이블을 봐야 한다
  foreach t in array array['rp_rooms', 'rp_messages', 'relations', 'qa_answers', 'posts', 'comments', 'guestbook', 'notifications', 'push_subs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;  -- 이미 추가돼 있으면 무시
    end;
  end loop;
end $$;

-- ── 9-1. API 접근 권한 (Supabase 2026-10-30 변경 대응) ─────────
-- 10월 30일부터 public 스키마에 새로 만든 테이블은 API(supabase-js) 권한이 자동으로 붙지 않는다.
-- 새 프로젝트에 이 스크립트를 처음 돌릴 때도 예전과 똑같이 쓸 수 있도록 직접 붙여 둔다.
-- 누가 무엇을 읽고 쓸 수 있는지는 위의 RLS 정책이 그대로 정한다 (권한 = 문 열기, 정책 = 열쇠).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- ── 10. 스키마 캐시 갱신 (중요) ──────────────────────────────
-- PostgREST(= REST API)는 테이블·컬럼 목록을 캐시해 둔다. SQL로 컬럼을 새로 추가해도
-- 캐시가 갱신되기 전에는 API가 그 컬럼을 모른다 —
--   Could not find the 'editor_ids' column of 'posts' in the schema cache (PGRST204)
-- 실제로 업데이트 후 「글을 저장하지 못했습니다」로 나타났다. 마지막에 캐시를 새로 읽게 한다.
notify pgrst, 'reload schema';

-- ── 완료 ─────────────────────────────────────────────────────
-- 이 스크립트를 실행한 뒤, 홈의 설치 화면에서 [연결 확인]을 누르면 검증됩니다.
-- 첫 번째로 가입하는 계정이 자동으로 관리자가 됩니다.
`;
