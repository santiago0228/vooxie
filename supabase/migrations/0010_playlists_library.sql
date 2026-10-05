-- Migración 0010: biblioteca del usuario (me gusta de cualquier fuente) y playlists
-- (privadas, públicas y colaborativas).
--
-- Una "canción" guardada se identifica con `track_key` y lleva un `snapshot` JSON con lo
-- necesario para volver a mostrarla/reproducirla (título, artista, portada, ids de catálogo).
-- El audio (streams) NUNCA se guarda aquí: es temporal y lo resuelve el player.
--   track_key:  vx:<uuid>  (catálogo VooXiE)   dz:<id> (Deezer)   au:<id> (Audius)   yt:<videoId>

-- ─────────────────────────────────────────────────────────────
-- 1. Canciones que te gustan (fuentes externas)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.saved_tracks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_key  text not null check (track_key ~ '^(vx|dz|au|yt):[A-Za-z0-9_-]{1,64}$'),
  snapshot   jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 8192),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, track_key)
);
create index if not exists saved_tracks_user_created_idx on public.saved_tracks (user_id, created_at desc);

alter table public.saved_tracks enable row level security;
create policy "saved_tracks: lectura propia" on public.saved_tracks for select using (user_id = auth.uid());
create policy "saved_tracks: alta propia" on public.saved_tracks for insert with check (user_id = auth.uid());
create policy "saved_tracks: baja propia" on public.saved_tracks for delete using (user_id = auth.uid());
revoke update, truncate on public.saved_tracks from anon, authenticated;
grant select, insert, delete on public.saved_tracks to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Playlists
-- ─────────────────────────────────────────────────────────────
create table if not exists public.playlists (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  description     text check (description is null or length(description) <= 300),
  cover_url       text check (cover_url is null or cover_url ~ '^https://'),
  is_public       boolean not null default false,
  is_collaborative boolean not null default false,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);
create index if not exists playlists_owner_idx on public.playlists (owner_id, updated_at desc);

create table if not exists public.playlist_members (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  added_at    timestamptz not null default timezone('utc', now()),
  primary key (playlist_id, user_id)
);
create index if not exists playlist_members_user_idx on public.playlist_members (user_id);

create table if not exists public.playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_key   text not null check (track_key ~ '^(vx|dz|au|yt):[A-Za-z0-9_-]{1,64}$'),
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 8192),
  added_by    uuid not null references auth.users (id) on delete cascade,
  position    integer not null default 0,
  added_at    timestamptz not null default timezone('utc', now()),
  unique (playlist_id, track_key)
);
create index if not exists playlist_items_playlist_idx on public.playlist_items (playlist_id, position, added_at);

-- updated_at de la playlist cuando cambia algo
create or replace function public.touch_playlist() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.playlists set updated_at = timezone('utc', now())
   where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end; $$;

drop trigger if exists playlist_items_touch on public.playlist_items;
create trigger playlist_items_touch after insert or delete on public.playlist_items
  for each row execute function public.touch_playlist();

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();

-- Posición al final por defecto
create or replace function public.playlist_item_position() returns trigger language plpgsql as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position from public.playlist_items where playlist_id = new.playlist_id;
  end if;
  return new;
end; $$;
drop trigger if exists playlist_items_position on public.playlist_items;
create trigger playlist_items_position before insert on public.playlist_items
  for each row execute function public.playlist_item_position();

-- Máximo razonable de canciones por playlist
create or replace function public.playlist_items_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.playlist_items where playlist_id = new.playlist_id) >= 1000 then
    raise exception 'La playlist alcanzó el máximo de 1000 canciones' using errcode = '54000';
  end if;
  return new;
end; $$;
drop trigger if exists playlist_items_limit on public.playlist_items;
create trigger playlist_items_limit before insert on public.playlist_items
  for each row execute function public.playlist_items_limit();

-- ── Permisos (funciones security definer: evitan recursión de RLS) ──
create or replace function public.can_view_playlist(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.playlists p
     where p.id = pid
       and (p.is_public
            or p.owner_id = auth.uid()
            or exists (select 1 from public.playlist_members m where m.playlist_id = p.id and m.user_id = auth.uid()))
  );
$$;

create or replace function public.can_edit_playlist(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.playlists p
     where p.id = pid
       and (p.owner_id = auth.uid()
            or (p.is_collaborative
                and exists (select 1 from public.playlist_members m where m.playlist_id = p.id and m.user_id = auth.uid())))
  );
$$;

grant execute on function public.can_view_playlist(uuid), public.can_edit_playlist(uuid) to authenticated;
revoke execute on function public.can_view_playlist(uuid), public.can_edit_playlist(uuid) from anon;

alter table public.playlists enable row level security;
alter table public.playlist_members enable row level security;
alter table public.playlist_items enable row level security;

create policy "playlists: ver" on public.playlists for select using (owner_id = auth.uid() or public.can_view_playlist(id));
create policy "playlists: crear" on public.playlists for insert with check (owner_id = auth.uid());
create policy "playlists: editar (dueño)" on public.playlists for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "playlists: borrar (dueño)" on public.playlists for delete using (owner_id = auth.uid());

-- Ver miembros: si puedes ver la playlist. Alta: solo vía RPC. Baja: el dueño o uno mismo (salir).
create policy "members: ver" on public.playlist_members for select using (public.can_view_playlist(playlist_id));
create policy "members: baja" on public.playlist_members for delete using (
  user_id = auth.uid() or exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
);

create policy "items: ver" on public.playlist_items for select using (public.can_view_playlist(playlist_id));
create policy "items: añadir" on public.playlist_items for insert with check (public.can_edit_playlist(playlist_id) and added_by = auth.uid());
create policy "items: quitar" on public.playlist_items for delete using (public.can_edit_playlist(playlist_id));

revoke update on public.playlist_items, public.playlist_members from anon, authenticated;
revoke all on public.playlists, public.playlist_members, public.playlist_items from anon;
grant select, insert, update, delete on public.playlists to authenticated;
grant select, delete on public.playlist_members to authenticated;
grant select, insert, delete on public.playlist_items to authenticated;

-- El dueño no puede cambiar owner_id (la política de update ya lo exige); is_collaborative solo del dueño (idem).

-- ── RPC: invitar a un colaborador por nombre de usuario ──
create or replace function public.add_playlist_member(p_playlist_id uuid, p_username text)
returns public.playlist_members
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  result public.playlist_members;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.playlists where id = p_playlist_id and owner_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into target from public.profiles where lower(username) = lower(btrim(p_username)) limit 1;
  if target is null then raise exception 'usuario no encontrado' using errcode = 'P0002'; end if;
  if target = auth.uid() then raise exception 'ya eres el dueño' using errcode = '22023'; end if;
  insert into public.playlist_members (playlist_id, user_id) values (p_playlist_id, target)
    on conflict (playlist_id, user_id) do update set added_at = public.playlist_members.added_at
    returning * into result;
  -- Invitar a alguien implica que la playlist es colaborativa.
  update public.playlists set is_collaborative = true where id = p_playlist_id and not is_collaborative;
  return result;
end; $$;
revoke execute on function public.add_playlist_member(uuid, text) from public, anon;
grant execute on function public.add_playlist_member(uuid, text) to authenticated;

-- ── Vista de miembros con nombre de usuario (sin exponer correos) ──
create or replace function public.playlist_member_names(p_playlist_id uuid)
returns table (user_id uuid, username text)
language sql security definer set search_path = public stable as $$
  select pr.id, pr.username
    from public.profiles pr
   where public.can_view_playlist(p_playlist_id)
     and (pr.id in (select m.user_id from public.playlist_members m where m.playlist_id = p_playlist_id)
          or pr.id = (select owner_id from public.playlists where id = p_playlist_id));
$$;
revoke execute on function public.playlist_member_names(uuid) from public, anon;
grant execute on function public.playlist_member_names(uuid) to authenticated;
