-- Migración 0007: catálogo organizado para música de artistas conocidos.
--
--   artist_profiles ─┬─ albums (álbum / EP / single, portada, fecha)
--                    │     └─ tracks (track_number) ── youtube_id ──▶ audio (vía youtube-proxy)
--                    └─ track_artists (principal / feat) ──▶ colaboraciones
--
-- Se REUTILIZAN artist_profiles, albums y tracks (no hay tablas duplicadas).
-- Un perfil importado ("catalog") no tiene cuenta de usuario: user_id pasa a ser
-- nullable. Cuando el artista real se registre, podrá reclamarlo (claimed).

-- ─────────────────────────────────────────────────────────────
-- 1. artist_profiles: perfiles sin cuenta (importados)
-- ─────────────────────────────────────────────────────────────
alter table public.artist_profiles alter column user_id drop not null;

alter table public.artist_profiles
  add column if not exists origin text not null default 'platform'
    check (origin in ('platform', 'catalog')),
  add column if not exists musicbrainz_id uuid,
  add column if not exists monthly_listeners bigint;

-- unique(user_id) se mantiene: en Postgres varios NULL no chocan.
create unique index if not exists artist_profiles_musicbrainz_idx
  on public.artist_profiles (musicbrainz_id) where musicbrainz_id is not null;

-- Un perfil 'catalog' no puede tener dueño; uno 'platform' sí o sí.
alter table public.artist_profiles drop constraint if exists artist_profiles_origin_owner;
alter table public.artist_profiles add constraint artist_profiles_origin_owner
  check ((origin = 'platform' and user_id is not null) or (origin = 'catalog' and user_id is null));

-- Los usuarios no pueden crear/convertir perfiles 'catalog' ni tocar musicbrainz_id.
-- (La política de insert exige user_id = auth.uid(), que nunca es null → ya los excluye;
--  este trigger además protege las columnas nuevas ante updates del dueño.)
create or replace function public.protect_artist_catalog_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.origin := 'platform';
    new.musicbrainz_id := null;
    new.monthly_listeners := null;
  elsif TG_OP = 'UPDATE' then
    new.origin := old.origin;
    new.musicbrainz_id := old.musicbrainz_id;
    new.monthly_listeners := old.monthly_listeners;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists artist_profiles_protect_catalog on public.artist_profiles;
create trigger artist_profiles_protect_catalog
  before insert or update on public.artist_profiles
  for each row execute function public.protect_artist_catalog_fields();

-- ─────────────────────────────────────────────────────────────
-- 2. albums: tipo, fuente y MusicBrainz
-- ─────────────────────────────────────────────────────────────
alter table public.albums
  add column if not exists album_type text not null default 'album'
    check (album_type in ('album', 'ep', 'single', 'compilation')),
  add column if not exists musicbrainz_id uuid;

create unique index if not exists albums_musicbrainz_idx
  on public.albums (musicbrainz_id) where musicbrainz_id is not null;
create index if not exists albums_release_date_idx on public.albums (release_date desc);

-- ─────────────────────────────────────────────────────────────
-- 3. tracks: audio por youtube_id (sin audio_url propio)
-- ─────────────────────────────────────────────────────────────
alter table public.tracks alter column audio_url drop not null;

alter table public.tracks
  add column if not exists youtube_id text,
  add column if not exists musicbrainz_id uuid,
  add column if not exists release_date date;

alter table public.tracks drop constraint if exists tracks_youtube_id_format;
alter table public.tracks add constraint tracks_youtube_id_format
  check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');

-- Toda canción necesita UNA fuente de audio: archivo propio o youtube_id.
alter table public.tracks drop constraint if exists tracks_has_audio_source;
alter table public.tracks add constraint tracks_has_audio_source
  check (audio_url is not null or youtube_id is not null);

create unique index if not exists tracks_musicbrainz_idx
  on public.tracks (musicbrainz_id) where musicbrainz_id is not null;
create index if not exists tracks_youtube_id_idx on public.tracks (youtube_id) where youtube_id is not null;
create index if not exists tracks_release_date_idx on public.tracks (release_date desc);

-- Los artistas de plataforma solo pueden crear tracks con audio propio (no youtube_id).
-- Se aplica con un trigger porque la política de insert existente no distingue columnas.
create or replace function public.protect_track_external_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.youtube_id := null;
    new.musicbrainz_id := null;
  elsif TG_OP = 'UPDATE' then
    new.youtube_id := old.youtube_id;
    new.musicbrainz_id := old.musicbrainz_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tracks_protect_external on public.tracks;
create trigger tracks_protect_external
  before insert or update on public.tracks
  for each row execute function public.protect_track_external_fields();

-- ─────────────────────────────────────────────────────────────
-- 4. track_artists: principal / feat (colaboraciones reales)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.track_artists (
  track_id  uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references public.artist_profiles (id) on delete cascade,
  role      text not null default 'featured' check (role in ('primary', 'featured')),
  position  smallint not null default 0,
  primary key (track_id, artist_id)
);

create index if not exists track_artists_artist_idx on public.track_artists (artist_id, role);

alter table public.track_artists enable row level security;
create policy "track_artists: lectura pública"
  on public.track_artists for select using (true);
-- Escritura: solo service_role (importador / admin). Sin políticas de insert/update/delete.
revoke insert, update, delete, truncate on public.track_artists from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Vistas de perfil de artista (lo que pinta la pantalla)
-- ─────────────────────────────────────────────────────────────
-- Todas las canciones donde el artista participa (principal o feat), recientes primero.
create or replace view public.artist_tracks
with (security_invoker = true) as
select
  ta.artist_id,
  ta.role,
  t.id as track_id,
  t.title,
  t.album_id,
  t.cover_url,
  t.duration_seconds,
  t.youtube_id,
  t.audio_url,
  t.is_explicit,
  coalesce(t.release_date, a.release_date, t.created_at::date) as released_on
from public.track_artists ta
join public.tracks t on t.id = ta.track_id and t.status = 'published'
left join public.albums a on a.id = t.album_id;

grant select on public.artist_tracks to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Búsqueda de artistas (para que el perfil salga PRIMERO)
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

create index if not exists artist_profiles_name_trgm_idx
  on public.artist_profiles using gin (display_name gin_trgm_ops);

-- Devuelve artistas ordenados: coincidencia exacta > empieza por > contiene, y más oyentes primero.
create or replace function public.search_artists(q text, max_results integer default 5)
returns setof public.artist_profiles
language sql
stable
set search_path = public
as $$
  select ap.*
  from public.artist_profiles ap
  where length(btrim(q)) >= 2
    and ap.display_name ilike '%' || replace(replace(replace(btrim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by
    (lower(ap.display_name) = lower(btrim(q))) desc,
    (lower(ap.display_name) like lower(btrim(q)) || '%') desc,
    ap.verified desc,
    coalesce(ap.monthly_listeners, 0) desc,
    ap.display_name
  limit greatest(1, least(max_results, 20));
$$;

grant execute on function public.search_artists(text, integer) to anon, authenticated;
