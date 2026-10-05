-- Fase 2: catálogo musical (álbumes, canciones, géneros, favoritos).
--
-- DECISIÓN IMPORTANTE: el prompt de Fase 2 proponía una tabla `artists`
-- nueva. Ya existe `artist_profiles` desde la migración 0001 (id, user_id,
-- display_name, bio, avatar_url, verified) — es exactamente lo mismo que
-- describía el prompt como `artists`. Esta migración NO crea una tabla
-- duplicada: `albums.artist_id` y `tracks.artist_id` referencian
-- `artist_profiles.id` directamente. Solo se agrega `cover_url` (banner),
-- que no existía todavía y hace falta para la pantalla de artista.

alter table public.artist_profiles
  add column if not exists cover_url text;

-- ─────────────────────────────────────────────
-- genres — taxonomía curada, no generada por usuarios
-- ─────────────────────────────────────────────
create table if not exists public.genres (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.genres enable row level security;

create policy "genres: lectura pública"
  on public.genres for select
  using (true);

-- Sin políticas de insert/update/delete: la taxonomía de géneros se
-- gestiona vía migraciones/seed, no desde el cliente con la anon key.

-- ─────────────────────────────────────────────
-- albums
-- ─────────────────────────────────────────────
create table if not exists public.albums (
  id uuid primary key default uuid_generate_v4(),
  artist_id uuid not null references public.artist_profiles (id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  release_date date,
  created_at timestamptz not null default now()
);

alter table public.albums enable row level security;

create index if not exists albums_artist_id_idx on public.albums (artist_id);
create index if not exists albums_title_idx
  on public.albums using gin (to_tsvector('spanish', title));

create policy "albums: lectura pública"
  on public.albums for select
  using (true);

-- Políticas de escritura adelantadas para cuando exista la subida de
-- música en VooXiE Artistas (fase futura) — no se usan todavía en Fase 2,
-- pero dejarlas ahora evita otra migración solo para esto. Un artista solo
-- puede escribir en SUS propios álbumes.
create policy "albums: el artista dueño crea sus álbumes"
  on public.albums for insert
  with check (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

create policy "albums: el artista dueño edita sus álbumes"
  on public.albums for update
  using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

create policy "albums: el artista dueño elimina sus álbumes"
  on public.albums for delete
  using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- tracks
-- ─────────────────────────────────────────────
create table if not exists public.tracks (
  id uuid primary key default uuid_generate_v4(),
  -- Nullable: un single publicado sin álbum es válido.
  album_id uuid references public.albums (id) on delete set null,
  artist_id uuid not null references public.artist_profiles (id) on delete cascade,
  title text not null,
  description text,
  audio_url text not null,
  -- Si es null, la app usa la portada del álbum como fallback (resuelto en
  -- la capa de servicios, no acá).
  cover_url text,
  duration_seconds integer not null default 0,
  track_number integer,
  is_explicit boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published')),
  plays_count bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tracks enable row level security;

create index if not exists tracks_artist_id_idx on public.tracks (artist_id);
create index if not exists tracks_album_id_idx on public.tracks (album_id);
create index if not exists tracks_plays_count_idx on public.tracks (plays_count desc);
create index if not exists tracks_title_idx
  on public.tracks using gin (to_tsvector('spanish', title));

-- Los oyentes solo ven canciones publicadas — los borradores (fase futura
-- de subida) quedan invisibles hasta que el artista los publique.
create policy "tracks: lectura pública de publicadas"
  on public.tracks for select
  using (status = 'published');

-- El propio artista dueño siempre puede ver sus borradores (útil para
-- cuando exista la pantalla de "Música" en VooXiE Artistas).
create policy "tracks: el artista dueño ve también sus borradores"
  on public.tracks for select
  using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

create policy "tracks: el artista dueño crea sus canciones"
  on public.tracks for insert
  with check (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

create policy "tracks: el artista dueño edita sus canciones"
  on public.tracks for update
  using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

create policy "tracks: el artista dueño elimina sus canciones"
  on public.tracks for delete
  using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.id = artist_id and ap.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- track_genres — relación N:N
-- ─────────────────────────────────────────────
create table if not exists public.track_genres (
  track_id uuid not null references public.tracks (id) on delete cascade,
  genre_id uuid not null references public.genres (id) on delete cascade,
  primary key (track_id, genre_id)
);

alter table public.track_genres enable row level security;

create policy "track_genres: lectura pública"
  on public.track_genres for select
  using (true);

create policy "track_genres: el artista dueño de la canción la clasifica"
  on public.track_genres for insert
  with check (
    exists (
      select 1 from public.tracks t
      join public.artist_profiles ap on ap.id = t.artist_id
      where t.id = track_id and ap.user_id = auth.uid()
    )
  );

create policy "track_genres: el artista dueño de la canción la desclasifica"
  on public.track_genres for delete
  using (
    exists (
      select 1 from public.tracks t
      join public.artist_profiles ap on ap.id = t.artist_id
      where t.id = track_id and ap.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- favorites — un usuario solo puede tocar SUS propios favoritos
-- ─────────────────────────────────────────────
create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.favorites enable row level security;

create index if not exists favorites_user_id_idx on public.favorites (user_id);

create policy "favorites: el usuario ve sus propios favoritos"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "favorites: el usuario agrega sus propios favoritos"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "favorites: el usuario elimina sus propios favoritos"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Contador de reproducciones — RPC en vez de UPDATE directo.
-- Si dejáramos una política de UPDATE abierta sobre tracks.plays_count,
-- cualquier cliente con la anon key podría poner el número que quiera.
-- Esta función solo permite incrementar de a 1, de forma seguura.
-- ─────────────────────────────────────────────
create or replace function public.increment_track_plays(track_id_input uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracks
  set plays_count = plays_count + 1
  where id = track_id_input and status = 'published';
$$;

grant execute on function public.increment_track_plays(uuid) to authenticated, anon;
