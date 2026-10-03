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
grant usage on schema public to anon, authenticated, service_role; grant usage on schema auth to anon, authenticated, service_role;`).catch(e=>console.log("setup",e.message));
for (const f of ["0001_init_profiles.sql","0002_auth_roles_security.sql","0003_catalog.sql","0005_tracks_feats.sql","0007_catalog_external.sql","0008_deezer_import.sql"]) {
  try { await db.exec(fs.readFileSync(M+f,"utf8").replace(/create extension[^;]*uuid-ossp[^;]*;/gi,"")); console.log("aplicada",f); } catch(e){ console.log("ERROR en",f,e.message); process.exit(1); }
}
console.log("OK migraciones");
const U="11111111-1111-1111-1111-111111111111";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${U}','a@b.c','{"username":"tester"}'::jsonb) on conflict do nothing;`);
await db.exec(`insert into public.profiles(id) values ('${U}') on conflict do nothing;`).catch(()=>{});
const t=async(n,f)=>{try{await f();console.log("OK  ",n)}catch(e){console.log("FAIL",n,"-",e.message)}};
const bad=async(sql,re)=>{let ok=false;try{await db.exec(sql)}catch(e){ok=re.test(e.message)||(console.log("   msg:",e.message),false)}if(!ok)throw new Error("debía fallar: "+sql.slice(0,70))};
const q=async(s)=>(await db.query(s)).rows;
const as=async(role,sub)=>db.exec(`reset role; set request.jwt.sub='${sub||""}'; set request.jwt.role='${role}'; set role ${role==="service_role"?"service_role":role};`);

await db.exec("grant all on all tables in schema public to service_role; grant select on all tables in schema public to anon, authenticated; grant insert, update on public.artist_profiles, public.tracks, public.albums to authenticated; grant select on public.profiles to anon, authenticated;");
await as("service_role");
await db.exec(`
insert into public.artist_profiles(display_name,origin,verified,monthly_listeners,musicbrainz_id) values
 ('Anuel AA','catalog',true,30000000,'aaaaaaaa-0000-0000-0000-000000000001'),
 ('Anuel','catalog',false,10,'aaaaaaaa-0000-0000-0000-000000000002'),
 ('Feid','catalog',true,40000000,'aaaaaaaa-0000-0000-0000-000000000003'),
 ('Karol G','catalog',true,60000000,'aaaaaaaa-0000-0000-0000-000000000004');
insert into public.albums(artist_id,title,album_type,release_date,cover_url)
 select id,'Real Hasta la Muerte','album','2018-07-17','https://c/a.jpg' from public.artist_profiles where display_name='Anuel AA';
insert into public.tracks(album_id,artist_id,title,youtube_id,track_number,release_date)
 select a.id,a.artist_id,'Ahora Me Llama','dQw4w9WgXcQ',1,'2018-07-17' from public.albums a;
insert into public.tracks(artist_id,title,youtube_id,release_date)
 select id,'Bby Wow','AAAAAAAAAAA','2024-01-01' from public.artist_profiles where display_name='Karol G';
insert into public.track_artists(track_id,artist_id,role,position)
 select t.id,ap.id,'primary',0 from public.tracks t join public.artist_profiles ap on ap.id=t.artist_id;
insert into public.track_artists(track_id,artist_id,role,position)
 select t.id,(select id from public.artist_profiles where display_name='Anuel AA'),'featured',1 from public.tracks t where t.title='Bby Wow';
`);
await db.exec("reset role");

await t("perfil importado sin user_id es válido (origin catalog)", async()=>{ const r=await q("select count(*)::int c from public.artist_profiles where origin='catalog' and user_id is null"); if(r[0].c!==4) throw new Error(JSON.stringify(r)); });
await t("constraint: catalog con user_id inválido", async()=>bad(`insert into public.artist_profiles(user_id,display_name,origin) values ('${U}','X','catalog')`,/origin_owner/));
await t("constraint: platform sin user_id inválido", async()=>bad(`insert into public.artist_profiles(display_name,origin) values ('X','platform')`,/origin_owner/));
await t("track sin audio_url ni youtube_id inválido", async()=>bad(`insert into public.tracks(artist_id,title) select id,'x' from public.artist_profiles limit 1`,/has_audio_source/));
await t("youtube_id con formato inválido", async()=>bad(`insert into public.tracks(artist_id,title,youtube_id) select id,'x','bad id' from public.artist_profiles limit 1`,/youtube_id_format/));

await t("search_artists('anuel'): exacto primero, luego por oyentes", async()=>{
  await as("anon");
  const r=await q("select display_name from public.search_artists('anuel')");
  await db.exec("reset role");
  if(r.map(x=>x.display_name).join("|")!=="Anuel|Anuel AA") throw new Error(JSON.stringify(r));
});
await t("search_artists('anu') prioriza más oyentes", async()=>{
  await as("anon"); const r=await q("select display_name from public.search_artists('anu')"); await db.exec("reset role");
  if(r[0].display_name!=="Anuel AA") throw new Error(JSON.stringify(r));
});
await t("search_artists trata % y _ como texto", async()=>{
  await as("anon"); const r=await q("select * from public.search_artists('%%')"); await db.exec("reset role");
  if(r.length!==0) throw new Error("comodín filtró todo");
});
await t("search_artists con 1 letra no devuelve nada", async()=>{
  await as("anon"); const r=await q("select * from public.search_artists('a')"); await db.exec("reset role");
  if(r.length!==0) throw new Error("devolvió");
});
await t("vista artist_tracks: colaboraciones y recientes primero (Anuel AA)", async()=>{
  await as("anon");
  const r=await q("select title,role from public.artist_tracks where artist_id=(select id from public.artist_profiles where display_name='Anuel AA') order by released_on desc");
  await db.exec("reset role");
  if(r.map(x=>x.title+":"+x.role).join("|")!=="Bby Wow:featured|Ahora Me Llama:primary") throw new Error(JSON.stringify(r));
});
await t("anon lee álbumes de un artista con orden de pistas", async()=>{
  await as("anon"); const r=await q("select a.title, t.title as song, t.track_number from public.albums a join public.tracks t on t.album_id=a.id"); await db.exec("reset role");
  if(r.length!==1||r[0].track_number!==1) throw new Error(JSON.stringify(r));
});
await t("anon NO puede escribir track_artists", async()=>{ await as("anon"); await bad(`insert into public.track_artists(track_id,artist_id) select t.id,a.id from public.tracks t, public.artist_profiles a limit 1`,/permission denied/); await db.exec("reset role"); });
await t("usuario NO puede editar origin/musicbrainz_id/user_id de su perfil", async()=>{
  await as("service_role");
  await db.exec(`insert into public.artist_profiles(user_id,display_name) values ('${U}','Mi Artista')`);
  await as("authenticated",U);
  await db.exec(`update public.artist_profiles set origin='catalog', musicbrainz_id='bbbbbbbb-0000-0000-0000-000000000009', monthly_listeners=999, display_name='Mi Artista 2' where user_id='${U}'`);
  await db.exec("reset role");
  const r=await q(`select origin,musicbrainz_id,monthly_listeners,display_name from public.artist_profiles where user_id='${U}'`);
  if(r[0].origin!=="platform"||r[0].musicbrainz_id!==null||r[0].monthly_listeners!==null) throw new Error(JSON.stringify(r));
  if(r[0].display_name!=="Mi Artista 2") throw new Error("no permitió editar nombre");
});
await t("usuario NO puede poner youtube_id en sus tracks", async()=>{
  await as("authenticated",U);
  await db.exec(`insert into public.tracks(artist_id,title,audio_url,youtube_id) select id,'Mio','https://a/b.mp3','dQw4w9WgXcQ' from public.artist_profiles where user_id='${U}'`);
  await db.exec("reset role");
  const r=await q("select youtube_id from public.tracks where title='Mio'");
  if(r[0].youtube_id!==null) throw new Error("se guardó youtube_id");
});
await t("usuario NO puede crear un perfil 'catalog'", async()=>{ await as("authenticated",U); await bad(`insert into public.artist_profiles(user_id,display_name,origin) values ('${U}','Fake','catalog')`,/.*/); await db.exec("reset role"); });

await t("0008: usuario NO puede poner deezer_id/isrc", async()=>{
  await as("authenticated",U);
  await db.exec(`insert into public.tracks(artist_id,title,audio_url,deezer_id,isrc) select id,'Mio2','https://a/b.mp3',555,'USUM71800009' from public.artist_profiles where user_id='${U}'`);
  await db.exec(`update public.artist_profiles set deezer_id=777 where user_id='${U}'`);
  await db.exec("reset role");
  const r=await q("select deezer_id,isrc from public.tracks where title='Mio2'");
  const a=await q(`select deezer_id from public.artist_profiles where user_id='${U}'`);
  if(r[0].deezer_id!==null||r[0].isrc!==null||a[0].deezer_id!==null) throw new Error(JSON.stringify([r,a]));
});
await t("0008: deezer_id único y isrc con formato", async()=>{
  await as("service_role");
  await db.exec("insert into public.artist_profiles(display_name,origin,deezer_id) values ('Dz1','catalog',9001)");
  await bad("insert into public.artist_profiles(display_name,origin,deezer_id) values ('Dz2','catalog',9001)",/duplicate|unique/);
  await bad("insert into public.tracks(artist_id,title,youtube_id,isrc) select id,'z','dQw4w9WgXcQ','bad' from public.artist_profiles limit 1",/isrc_format/);
  await db.exec("reset role");
});
