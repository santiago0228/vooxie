-- Migración 0006: caché de tracks resueltos (metadata permanente + stream temporal).
--
-- ARQUITECTURA
--   · metadata (title, artist, artwork_url, duration, canvas_url, producers): permanente.
--   · stream_url + stream_expires_at: TEMPORAL; se renueva cuando expira.
--   · Escritura de metadata/stream: SOLO la Edge Function `youtube-proxy` (service_role).
--   · Canvas/productores: SOLO administradores, vía RPC `admin_set_track_extras`.
--   · La app (anon/authenticated) únicamente LEE.

-- ─────────────────────────────────────────────────────────────
-- 1. Administradores (para editar Canvas / productores)
-- ─────────────────────────────────────────────────────────────
-- Se agregan manualmente desde Studio o con service_role:
--   insert into public.admin_users (user_id) values ('<uuid del usuario>');
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- Sin políticas: ni anon ni authenticated pueden leer o escribir la tabla directamente.
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = uid);
$$;

grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.is_admin(uuid) from anon;

-- ─────────────────────────────────────────────────────────────
-- 2. Tabla de caché
-- ─────────────────────────────────────────────────────────────
create table if not exists public.youtube_tracks_cache (
  youtube_id        text primary key,
  title             text not null,
  artist            text not null,
  artwork_url       text,
  stream_url        text,
  duration          integer,
  canvas_url        text,
  producers         text[] not null default '{}',
  stream_expires_at timestamptz,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now()),

  constraint youtube_tracks_cache_id_format
    check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint youtube_tracks_cache_title_not_blank
    check (length(btrim(title)) > 0),
  constraint youtube_tracks_cache_artist_not_blank
    check (length(btrim(artist)) > 0),
  constraint youtube_tracks_cache_duration_positive
    check (duration is null or duration > 0),
  constraint youtube_tracks_cache_stream_https
    check (stream_url is null or stream_url ~ '^https://'),
  constraint youtube_tracks_cache_canvas_https
    check (canvas_url is null or canvas_url ~ '^https://'),
  constraint youtube_tracks_cache_artwork_https
    check (artwork_url is null or artwork_url ~ '^https://'),
  -- stream_url y stream_expires_at van siempre juntos (o ambos null).
  constraint youtube_tracks_cache_stream_pair
    check ((stream_url is null) = (stream_expires_at is null))
);

create index if not exists youtube_tracks_cache_stream_expires_idx
  on public.youtube_tracks_cache (stream_expires_at);
create index if not exists youtube_tracks_cache_updated_idx
  on public.youtube_tracks_cache (updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. updated_at automático
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists youtube_tracks_cache_set_updated_at on public.youtube_tracks_cache;
create trigger youtube_tracks_cache_set_updated_at
  before update on public.youtube_tracks_cache
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. RLS: lectura para la app; ninguna escritura directa
-- ─────────────────────────────────────────────────────────────
alter table public.youtube_tracks_cache enable row level security;

drop policy if exists "youtube_tracks_cache: lectura" on public.youtube_tracks_cache;
create policy "youtube_tracks_cache: lectura"
  on public.youtube_tracks_cache for select
  to anon, authenticated
  using (true);

-- Sin políticas de insert/update/delete: con RLS activo quedan denegadas para
-- anon y authenticated. service_role omite RLS (Edge Function).
-- Defensa en profundidad: además revocamos los privilegios de tabla.
revoke insert, update, delete, truncate on public.youtube_tracks_cache from anon, authenticated;
grant select on public.youtube_tracks_cache to anon, authenticated;
-- La Edge Function (service_role) escribe la caché. (En Supabase ya lo tiene por defecto; se deja explícito.)
grant select, insert, update on public.youtube_tracks_cache to service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC administrativa: Canvas y productores (nada más)
-- ─────────────────────────────────────────────────────────────
-- security definer: corre con privilegios del owner, pero valida is_admin() y
-- solo toca canvas_url / producers. youtube_id se mantiene como asociación.
create or replace function public.admin_set_track_extras(
  p_youtube_id text,
  p_canvas_url text default null,
  p_producers  text[] default null,
  p_clear_canvas boolean default false
)
returns public.youtube_tracks_cache
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.youtube_tracks_cache;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_canvas_url is not null and p_canvas_url !~ '^https://' then
    raise exception 'canvas_url debe ser https' using errcode = '22023';
  end if;

  update public.youtube_tracks_cache
     set canvas_url = case
           when p_clear_canvas then null
           when p_canvas_url is not null then p_canvas_url
           else canvas_url
         end,
         producers = coalesce(p_producers, producers)
   where youtube_id = p_youtube_id
   returning * into result;

  if not found then
    raise exception 'track no encontrado' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke execute on function public.admin_set_track_extras(text, text, text[], boolean) from public, anon;
grant execute on function public.admin_set_track_extras(text, text, text[], boolean) to authenticated;
