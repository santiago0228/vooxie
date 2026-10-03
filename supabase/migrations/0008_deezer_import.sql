-- Migración 0008: soporte del importador de Deezer (artistas, álbumes, canciones).
-- Solo service_role (importador) escribe estas columnas; los triggers de 0007 se
-- amplían para que ningún usuario pueda auto-asignarlas.

alter table public.artist_profiles
  add column if not exists deezer_id bigint;
alter table public.albums
  add column if not exists deezer_id bigint;
alter table public.tracks
  add column if not exists deezer_id bigint,
  add column if not exists isrc text;

create unique index if not exists artist_profiles_deezer_idx on public.artist_profiles (deezer_id) where deezer_id is not null;
create unique index if not exists albums_deezer_idx on public.albums (deezer_id) where deezer_id is not null;
create unique index if not exists tracks_deezer_idx on public.tracks (deezer_id) where deezer_id is not null;
create index if not exists tracks_isrc_idx on public.tracks (isrc) where isrc is not null;

alter table public.tracks drop constraint if exists tracks_isrc_format;
alter table public.tracks add constraint tracks_isrc_format
  check (isrc is null or isrc ~ '^[A-Z0-9]{12}$');

-- Perfiles importados pueden ser MÍNIMOS (solo nombre + foto): se crean como
-- colaboradores de una canción y se completan cuando se importen a fondo.

-- ── Triggers: proteger las columnas nuevas ──────────────────────
create or replace function public.protect_artist_catalog_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if TG_OP = 'INSERT' then
    new.origin := 'platform'; new.musicbrainz_id := null; new.deezer_id := null; new.monthly_listeners := null;
  elsif TG_OP = 'UPDATE' then
    new.origin := old.origin; new.musicbrainz_id := old.musicbrainz_id; new.deezer_id := old.deezer_id;
    new.monthly_listeners := old.monthly_listeners; new.user_id := old.user_id;
  end if;
  return new;
end; $$;

create or replace function public.protect_track_external_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if TG_OP = 'INSERT' then
    new.youtube_id := null; new.musicbrainz_id := null; new.deezer_id := null; new.isrc := null;
  elsif TG_OP = 'UPDATE' then
    new.youtube_id := old.youtube_id; new.musicbrainz_id := old.musicbrainz_id;
    new.deezer_id := old.deezer_id; new.isrc := old.isrc;
  end if;
  return new;
end; $$;

create or replace function public.protect_album_external_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if TG_OP = 'INSERT' then
    new.musicbrainz_id := null; new.deezer_id := null;
  elsif TG_OP = 'UPDATE' then
    new.musicbrainz_id := old.musicbrainz_id; new.deezer_id := old.deezer_id;
  end if;
  return new;
end; $$;

drop trigger if exists albums_protect_external on public.albums;
create trigger albums_protect_external
  before insert or update on public.albums
  for each row execute function public.protect_album_external_fields();
