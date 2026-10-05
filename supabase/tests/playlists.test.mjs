// Pruebas de la migración 0010 (playlists, colaboración y me gusta externos) sobre Postgres en memoria.
// Ejecutar: node supabase/tests/playlists.test.mjs   (requiere @electric-sql/pglite)
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";

const db = new PGlite({ extensions: { pg_trgm } });
const M = new URL("../migrations/", import.meta.url).pathname;
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.role', true),''),'authenticated') $$;
create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
grant usage on schema public to anon, authenticated, service_role; grant usage on schema auth to anon, authenticated, service_role;`);
// Como en Supabase: los privilegios por defecto dan acceso a anon/authenticated al crear tablas;
// cada migración debe REVOCAR lo que no corresponde.
await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on functions to anon, authenticated, service_role;");
for (const f of ["0001_init_profiles.sql","0002_auth_roles_security.sql","0003_catalog.sql","0005_tracks_feats.sql","0006_youtube_tracks_cache.sql","0007_catalog_external.sql","0008_deezer_import.sql","0009_track_matches.sql","0010_playlists_library.sql"]) {
  await db.exec(fs.readFileSync(M + f, "utf8").replace(/create extension[^;]*uuid-ossp[^;]*;/gi, ""));
}

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "33333333-3333-3333-3333-333333333333";
for (const [id, u] of [[A, "ana"], [B, "beto"], [C, "carla"]]) {
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${u}@x.c','{"username":"${u}"}'::jsonb);`);
}
const as = async (uid) => db.exec(`reset role; set request.jwt.sub='${uid || ""}'; set request.jwt.role='${uid ? "authenticated" : "anon"}'; set role ${uid ? "authenticated" : "anon"};`);
const q = async (s) => (await db.query(s)).rows;
let fails = 0;
const t = async (n, f) => { try { await f(); console.log("OK  ", n); } catch (e) { fails++; console.log("FAIL", n, "-", e.message); } finally { await db.exec("reset role"); } };
const bad = async (sql, re) => { let ok = false; try { await db.exec(sql); } catch (e) { ok = re.test(e.message) || (console.log("   msg:", e.message), false); } if (!ok) throw new Error("debía fallar: " + sql.slice(0, 80)); };
const snap = `'{"title":"Hawái","artist":"Maluma"}'::jsonb`;

let pid, pidPublic;
await t("crear playlist propia", async () => {
  await as(A);
  const r = await q(`insert into public.playlists(owner_id,name) values ('${A}','Mi mix') returning id`);
  pid = r[0].id;
});
await t("no se puede crear a nombre de otro", async () => { await as(B); await bad(`insert into public.playlists(owner_id,name) values ('${A}','x')`, /row-level security/); });
await t("nombre vacío inválido", async () => { await as(A); await bad(`insert into public.playlists(owner_id,name) values ('${A}','   ')`, /check|violates/); });
await t("playlist privada: otros no la ven", async () => {
  await as(B); const r = await q(`select * from public.playlists where id='${pid}'`); if (r.length) throw new Error("B la vio");
  await as(null);
  try { const a = await q(`select * from public.playlists where id='${pid}'`); if (a.length) throw new Error("anon la vio"); }
  catch (e) { if (!/permission denied/.test(e.message)) throw e; }
});
await t("el dueño añade canciones; duplicado rechazado; posición automática", async () => {
  await as(A);
  await db.exec(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:100',${snap},'${A}')`);
  await db.exec(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:101',${snap},'${A}')`);
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:100',${snap},'${A}')`, /duplicate|unique/);
  const r = await q(`select track_key, position from public.playlist_items where playlist_id='${pid}' order by position`);
  if (r.map((x) => x.track_key + ":" + x.position).join() !== "dz:100:1,dz:101:2") throw new Error(JSON.stringify(r));
});
await t("track_key inválido o snapshot enorme rechazados", async () => {
  await as(A);
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','xx:1',${snap},'${A}')`, /check|violates/);
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:7','{"a":"${"x".repeat(9000)}"}'::jsonb,'${A}')`, /check|violates/);
});
await t("no dueño NO puede añadir a playlist no colaborativa", async () => {
  await as(B); await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:200',${snap},'${B}')`, /row-level security/);
});
await t("solo el dueño invita; usuario inexistente falla", async () => {
  await as(B); await bad(`select public.add_playlist_member('${pid}','carla')`, /forbidden/);
  await as(A); await bad(`select public.add_playlist_member('${pid}','nadie')`, /no encontrado/);
  await bad(`select public.add_playlist_member('${pid}','ana')`, /dueño/);
});
await t("invitar convierte en colaborativa y el invitado puede ver y añadir", async () => {
  await as(A); await db.exec(`select public.add_playlist_member('${pid}','BETO')`);
  const p = await q(`select is_collaborative from public.playlists where id='${pid}'`); if (!p[0].is_collaborative) throw new Error("no colaborativa");
  await as(B);
  if ((await q(`select * from public.playlists where id='${pid}'`)).length !== 1) throw new Error("B no la ve");
  await db.exec(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:300',${snap},'${B}')`);
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:301',${snap},'${A}')`, /row-level security/); // no puede firmar como otro
});
await t("el colaborador NO puede renombrar ni borrar la playlist, ni invitar", async () => {
  await as(B);
  await db.exec(`update public.playlists set name='hack' where id='${pid}'`);
  await db.exec(`delete from public.playlists where id='${pid}'`);
  await bad(`select public.add_playlist_member('${pid}','carla')`, /forbidden/);
  await db.exec("reset role");
  const r = await q(`select name from public.playlists where id='${pid}'`); if (r.length !== 1 || r[0].name !== "Mi mix") throw new Error(JSON.stringify(r));
});
await t("un tercero (no miembro) no ve ni añade", async () => {
  await as(C);
  if ((await q(`select * from public.playlist_items where playlist_id='${pid}'`)).length) throw new Error("C vio items");
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pid}','dz:400',${snap},'${C}')`, /row-level security/);
});
await t("nombres de miembros solo para quien puede ver", async () => {
  await as(A); const r = await q(`select username from public.playlist_member_names('${pid}') order by username`);
  if (r.map((x) => x.username).join() !== "ana,beto") throw new Error(JSON.stringify(r));
  await as(C); const c = await q(`select * from public.playlist_member_names('${pid}')`); if (c.length) throw new Error("C vio miembros");
});
await t("el colaborador puede quitar canciones y salir de la playlist", async () => {
  await as(B);
  await db.exec(`delete from public.playlist_items where playlist_id='${pid}' and track_key='dz:300'`);
  await db.exec(`delete from public.playlist_members where playlist_id='${pid}' and user_id='${B}'`);
  await db.exec("reset role");
  if ((await q(`select * from public.playlist_members where playlist_id='${pid}'`)).length) throw new Error("sigue miembro");
  await as(B); if ((await q(`select * from public.playlists where id='${pid}'`)).length) throw new Error("aún la ve");
});
await t("playlist pública: cualquiera autenticado la ve pero no edita; anon no", async () => {
  await as(A);
  pidPublic = (await q(`insert into public.playlists(owner_id,name,is_public) values ('${A}','Pública',true) returning id`))[0].id;
  await db.exec(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pidPublic}','dz:1',${snap},'${A}')`);
  await as(C);
  if ((await q(`select * from public.playlist_items where playlist_id='${pidPublic}'`)).length !== 1) throw new Error("C no la ve");
  await bad(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pidPublic}','dz:2',${snap},'${C}')`, /row-level security/);
  await as(null);
  let denied = false, rows = -1;
  try { rows = (await q(`select * from public.playlists`)).length; } catch (e) { denied = /permission denied/.test(e.message); }
  if (!denied && rows !== 0) throw new Error("anon ve playlists: " + rows);
});
await t("updated_at de la playlist se actualiza al cambiar canciones", async () => {
  await db.exec("reset role");
  const before = (await q(`select updated_at from public.playlists where id='${pidPublic}'`))[0].updated_at;
  await new Promise((r) => setTimeout(r, 60));
  await as(A);
  await db.exec(`insert into public.playlist_items(playlist_id,track_key,snapshot,added_by) values ('${pidPublic}','dz:3',${snap},'${A}')`);
  await db.exec("reset role");
  const after = (await q(`select updated_at from public.playlists where id='${pidPublic}'`))[0].updated_at;
  if (!(after > before)) throw new Error("no cambió");
});
await t("borrar la playlist borra items y miembros (cascade)", async () => {
  await as(A); await db.exec(`delete from public.playlists where id='${pid}'`); await db.exec("reset role");
  if ((await q(`select * from public.playlist_items where playlist_id='${pid}'`)).length) throw new Error("items huérfanos");
});
await t("saved_tracks: solo el dueño ve/crea/borra; no hay update", async () => {
  await as(A); await db.exec(`insert into public.saved_tracks(user_id,track_key,snapshot) values ('${A}','dz:100',${snap})`);
  await bad(`insert into public.saved_tracks(user_id,track_key,snapshot) values ('${A}','dz:100',${snap})`, /duplicate|unique/);
  await bad(`insert into public.saved_tracks(user_id,track_key,snapshot) values ('${B}','dz:100',${snap})`, /row-level security/);
  await bad(`update public.saved_tracks set track_key='dz:9'`, /permission denied/);
  await as(B); if ((await q(`select * from public.saved_tracks`)).length) throw new Error("B vio de A");
  await as(A); await db.exec(`delete from public.saved_tracks where track_key='dz:100'`);
  if ((await q(`select * from public.saved_tracks`)).length) throw new Error("no borró");
});
console.log(fails ? `\n${fails} FALLOS` : "\nTODO OK");
process.exit(fails ? 1 : 0);
