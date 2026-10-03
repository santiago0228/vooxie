-- Fase 1: Auth — automatización de profiles + funciones de soporte de login +
-- protección contra auto-elevación de privilegios en artist_profiles.
-- No modifica ni reemplaza 0001_init_profiles.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. Creación automática de `profiles` al crear un auth.users
-- ─────────────────────────────────────────────────────────────
-- Antes, el plan era que el cliente insertara la fila en `profiles` después
-- de auth.signUp(). Eso deja una ventana donde puede existir un auth.users
-- sin profiles correspondiente (si la app se cierra entre signUp() y el
-- insert, o si el insert falla por cualquier motivo de red).
--
-- Con este trigger, la fila de `profiles` se crea en la MISMA transacción
-- que el auth.users, usando el username que el cliente pasa en
-- `options.data.username` al llamar signUp(). Si el username ya existe,
-- la restricción UNIQUE de profiles.username hace fallar el trigger y,
-- con él, la creación del usuario en Auth — el cliente debe llamar antes
-- a is_username_available() para minimizar este caso, pero de todas formas
-- queda cubierta la condición de carrera (dos registros simultáneos con el
-- mismo username: solo uno gana).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, is_public)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    true
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- La política de INSERT en profiles ("el usuario crea su propio perfil")
-- de 0001 ya no es el camino principal (ahora lo hace el trigger, que corre
-- como security definer y no pasa por RLS), pero la dejamos: sirve como red
-- de seguridad si en el futuro se necesita crear un profile fuera del flujo
-- de signUp (por ejemplo, una migración de datos).

-- ─────────────────────────────────────────────────────────────
-- 2. Disponibilidad de username — sin depender de is_public
-- ─────────────────────────────────────────────────────────────
-- profiles.select ahora respeta is_public (0001), así que un cliente
-- anónimo NO puede simplemente hacer `select username from profiles`
-- para saber si un username está tomado si el perfil es privado.
-- Esta función expone únicamente un booleano, nunca la fila completa.

create or replace function public.is_username_available(check_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(check_username)
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Login con username (además de email)
-- ─────────────────────────────────────────────────────────────
-- Supabase Auth solo hace signInWithPassword con email. Para permitir
-- login con username, resolvemos username -> email en el servidor.
--
-- Importante: devuelve NULL tanto si el identifier no existe como si
-- existe pero no se pudo resolver — el cliente debe mostrar el MISMO
-- mensaje de error genérico ("credenciales inválidas") en ambos casos,
-- para no revelar si un username/email existe (enumeración de cuentas).

create or replace function public.resolve_login_identifier(identifier text)
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(
    (select email from auth.users where lower(email) = lower(identifier) limit 1),
    (
      select u.email
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(p.username) = lower(identifier)
      limit 1
    )
  );
$$;

grant execute on function public.resolve_login_identifier(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Helper is_artist() — reutilizable en RLS de fases futuras
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_artist(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.artist_profiles where user_id = uid
  );
$$;

grant execute on function public.is_artist(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. FIX DE SEGURIDAD: proteger artist_profiles.verified
-- ─────────────────────────────────────────────────────────────
-- Problema real en 0001: la política de UPDATE de artist_profiles
-- ("using (auth.uid() = user_id) with check (auth.uid() = user_id)")
-- permite al dueño actualizar CUALQUIER columna de su propia fila,
-- incluida `verified`. Es decir: un usuario podía hacer
--   supabase.from('artist_profiles').update({ verified: true })
-- y auto-verificarse. La política de fila (RLS) es correcta para
-- "quién puede tocar la fila", pero no restringe QUÉ columnas.
--
-- Este trigger fuerza `verified` a su valor anterior (o a false en
-- INSERT) en cualquier operación que no venga del rol service_role
-- (es decir, cualquier operación hecha desde la app con la anon key).
-- La verificación real de un artista deberá hacerse en una fase futura
-- vía Edge Function con service_role, o manualmente desde Supabase Studio.

create or replace function public.protect_artist_verified()
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
    new.verified := false;
  elsif TG_OP = 'UPDATE' then
    new.verified := old.verified;
  end if;

  return new;
end;
$$;

drop trigger if exists artist_profiles_protect_verified on public.artist_profiles;

create trigger artist_profiles_protect_verified
  before insert or update on public.artist_profiles
  for each row execute function public.protect_artist_verified();
