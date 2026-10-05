-- Fase 0: base de identidad (profiles + artist_profiles)
-- El resto de tablas (songs, albums, playlists, etc.) se agregan en migraciones
-- posteriores, una por fase, según el roadmap de VooXiE_Arquitectura.md

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- profiles: 1:1 con auth.users, cuenta de OYENTE
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- OJO: antes esta política usaba `using (true)`, lo que ignoraba por completo
-- la columna is_public y dejaba leer cualquier perfil marcado como privado.
-- Un perfil privado solo debe ser visible para su propio dueño.
create policy "profiles: lectura pública o propia"
  on public.profiles for select
  using (is_public = true or auth.uid() = id);

-- El UPDATE ahora tiene también WITH CHECK: sin esto, la fila resultante
-- de la actualización no se vuelve a validar, y en teoría se podría
-- intentar reasignar `id` a otro valor dentro del mismo UPDATE.
create policy "profiles: el usuario edita su propio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: el usuario crea su propio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ─────────────────────────────────────────────
-- artist_profiles: perfil de ARTISTA, vinculado a un profiles.id
-- Un usuario puede tener profiles (oyente) y, opcionalmente,
-- un artist_profiles asociado — no son la misma identidad.
-- ─────────────────────────────────────────────
create table if not exists public.artist_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  bio text,
  avatar_url text,
  verified boolean not null default false,
  public_stats_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.artist_profiles enable row level security;

-- A diferencia de profiles, artist_profiles no tiene un flag de privacidad:
-- un perfil de artista es público por definición (es la vitrina del artista).
create policy "artist_profiles: lectura pública"
  on public.artist_profiles for select
  using (true);

create policy "artist_profiles: el dueño edita su perfil de artista"
  on public.artist_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "artist_profiles: el dueño crea su perfil de artista"
  on public.artist_profiles for insert
  with check (auth.uid() = user_id);

-- Índice para búsquedas por nombre de artista (útil desde Fase 2 en adelante)
create index if not exists artist_profiles_display_name_idx
  on public.artist_profiles using gin (to_tsvector('spanish', display_name));
