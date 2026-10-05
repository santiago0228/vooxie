#!/usr/bin/env node
/**
 * Uso:
 *   node src/cli.mjs "Anuel AA" "Feid" "Eladio Carrion"
 *   node src/cli.mjs --deezer-id 7234 --max-albums 20
 *   node src/cli.mjs "Karol G" --no-match      (solo importa; sin buscar audio)
 *
 * Variables de entorno (NUNCA van a la app):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YTDLP_SERVICE_URL, YTDLP_SERVICE_TOKEN
 */
import { createDeezerClient } from "./deezer.mjs";
import { importArtist } from "./importer.mjs";
import { createSupabaseDb } from "./supabaseDb.mjs";
import { createYtdlpMatcher } from "./ytdlp.mjs";

function parseArgs(argv) {
  const names = [];
  const o = { deezerIds: [], match: true, includeTop: true, maxAlbums: 60, maxTracks: 400, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--deezer-id") o.deezerIds.push(Number(argv[++i]));
    else if (a === "--no-match") o.match = false;
    else if (a === "--no-top") o.includeTop = false;
    else if (a === "--max-albums") o.maxAlbums = Number(argv[++i]);
    else if (a === "--max-tracks") o.maxTracks = Number(argv[++i]);
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`Opción desconocida: ${a}`);
    else names.push(a);
  }
  for (const n of [o.maxAlbums, o.maxTracks, ...o.deezerIds]) {
    if (!Number.isInteger(n) || n <= 0) throw new Error("Los valores numéricos deben ser enteros > 0.");
  }
  return { names, ...o };
}

function need(name) {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Falta la variable de entorno ${name}.`);
  return v;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.names.length && !args.deezerIds.length)) {
    console.log('Uso: node src/cli.mjs "Artista" [...] [--deezer-id N] [--no-match] [--no-top] [--max-albums N] [--max-tracks N]');
    process.exit(args.help ? 0 : 1);
  }
  const log = (m) => console.log(m);
  const db = createSupabaseDb({ url: need("SUPABASE_URL"), serviceRoleKey: need("SUPABASE_SERVICE_ROLE_KEY") });
  const matcher = args.match
    ? createYtdlpMatcher({ baseUrl: need("YTDLP_SERVICE_URL"), token: need("YTDLP_SERVICE_TOKEN"), log })
    : null;
  const deezer = createDeezerClient({ log });

  const refs = [...args.names.map((name) => ({ name })), ...args.deezerIds.map((deezerId) => ({ deezerId }))];
  let failures = 0;
  for (const ref of refs) {
    console.log(`\n=== ${ref.name ?? `deezer:${ref.deezerId}`} ===`);
    try {
      const r = await importArtist({ deezer, db, matcher, log }, ref, {
        includeTop: args.includeTop, maxAlbums: args.maxAlbums, maxTracks: args.maxTracks,
      });
      const s = r.stats;
      console.log(`\nListo: ${r.name} → ${s.albums} álbumes, ${s.tracks} canciones, ${s.artists} artistas, ` +
                  `${s.noAudio} sin audio, ${s.failed} errores.`);
    } catch (e) {
      failures++;
      console.error(`Error: ${e.message}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
