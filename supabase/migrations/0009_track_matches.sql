-- Migración 0009: emparejado canción de catálogo (Deezer) → video de YouTube.
-- Evita repetir el emparejado: una vez que "Hawái – Maluma" (deezer 123) se asoció a un
-- youtube_id, las siguientes reproducciones van directo a la caché de streams.
-- Solo la Edge Function (service_role) escribe; la app solo lee.

create table if not exists public.track_matches (
  deezer_id  bigint primary key,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists track_matches_youtube_idx on public.track_matches (youtube_id);

alter table public.track_matches enable row level security;
create policy "track_matches: lectura"
  on public.track_matches for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.track_matches from anon, authenticated;
grant select on public.track_matches to anon, authenticated;
grant select, insert, update on public.track_matches to service_role;
