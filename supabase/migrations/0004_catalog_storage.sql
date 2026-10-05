-- Fase 2: buckets de Storage separados por tipo de contenido.
-- artist-images y album-covers son públicos (se muestran directo con URL
-- pública, sin autenticación) — track-audio también es público por ahora
-- porque VooXiE (oyentes) no implementa DRM/URLs firmadas en esta fase;
-- si más adelante hace falta proteger el audio, este bucket pasa a privado
-- y se sirve con URLs firmadas desde un service, sin tocar el resto.

insert into storage.buckets (id, name, public)
values
  ('artist-images', 'artist-images', true),
  ('album-covers', 'album-covers', true),
  ('track-audio', 'track-audio', true)
on conflict (id) do nothing;

-- Lectura pública de los 3 buckets (coherente con que el catálogo es
-- público en toda la app).
create policy "artist-images: lectura pública"
  on storage.objects for select
  using (bucket_id = 'artist-images');

create policy "album-covers: lectura pública"
  on storage.objects for select
  using (bucket_id = 'album-covers');

create policy "track-audio: lectura pública"
  on storage.objects for select
  using (bucket_id = 'track-audio');

-- Escritura: solo el artista dueño, en su propia carpeta
-- ({artist_id}/archivo.ext) — adelantado para la fase de subida de música
-- en VooXiE Artistas, no se usa todavía desde VooXiE (oyentes).
create policy "artist-images: el artista dueño sube a su carpeta"
  on storage.objects for insert
  with check (
    bucket_id = 'artist-images'
    and exists (
      select 1 from public.artist_profiles ap
      where ap.user_id = auth.uid()
        and (storage.foldername(name))[1] = ap.id::text
    )
  );

create policy "album-covers: el artista dueño sube a su carpeta"
  on storage.objects for insert
  with check (
    bucket_id = 'album-covers'
    and exists (
      select 1 from public.artist_profiles ap
      where ap.user_id = auth.uid()
        and (storage.foldername(name))[1] = ap.id::text
    )
  );

create policy "track-audio: el artista dueño sube a su carpeta"
  on storage.objects for insert
  with check (
    bucket_id = 'track-audio'
    and exists (
      select 1 from public.artist_profiles ap
      where ap.user_id = auth.uid()
        and (storage.foldername(name))[1] = ap.id::text
    )
  );
