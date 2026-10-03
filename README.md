# VooXiE — Monorepo (Expo SDK 57 + Supabase + yt-dlp)

```
Usuario busca
  └▶ unifiedSearch()  ─▶ caché Supabase ─▶ (si hace falta) youtube-proxy /search ─▶ yt-dlp
        │ resultados = metadata (SIN extraer audio)
        ▼
Usuario elige una canción
  └▶ resolveTrack(videoId) ─▶ caché ─▶ ¿stream válido? ── sí ─▶ UnifiedTrack
                                              └─ no ─▶ youtube-proxy /resolve ─▶ servicio yt-dlp ─▶ UPSERT caché
        ▼
  UnifiedTrack.streamUrl ─▶ AudioEngine (expo-audio) ─▶ reproducción ─▶ Canvas
```

| Capa | Hace | NO hace |
|---|---|---|
| **App** (`apps/*`, `packages/core`) | UI, navegación, búsqueda, estado, reproducir `streamUrl`, Canvas | extraer audio, ejecutar yt-dlp, tener secretos |
| **Supabase** | persistencia, caché, metadata, Canvas, productores, RLS | — |
| **Edge Function** `youtube-proxy` | validar, autenticar, hablar con yt-dlp, normalizar, actualizar caché | reproducir |
| **Servicio yt-dlp** (`services/yt-dlp`) | `/search`, `/extract`, expiración del stream | exponerse sin token |
| **Player** (`AudioEngine`) | reproducir una URL de audio | buscar / extraer / guardar metadata |

El **TrackResolver** (nivel superior) mantiene cada track de YouTube con un stream válido; si el stream
expira durante la reproducción el player lo *informa* y el resolver renueva solo el stream
(título, artista, artwork, duración, Canvas, productores y `youtube_id` se conservan).

---

## 1. Requisitos
- Node.js ≥ 20.19.4 (requisito de React Native 0.86)
- pnpm 9.0.0 (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- Supabase CLI + Docker Desktop
- Python 3.12 (solo para correr los tests del servicio) y Docker (para desplegarlo)
- Xcode (iOS) y/o Android Studio (Android)
- **Development Build** (EAS o `expo run:*`). No funciona en Expo Go: usa reproducción en segundo plano.

## 2. Instalación
```bash
pnpm install
cp .env.example .env          # completa EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
```

## 3. Expo SDK 57 — versiones fijadas
`expo ~57.0.26`, `react 19.2.3`, `react-native 0.86.3`, `expo-router ~57.0.24`, `expo-audio ~57.0.5`,
`react-native-screens ~4.26.0`, `react-native-safe-area-context ~5.7.0`, `expo-splash-screen ~57.0.9`
(el splash ahora es un *plugin*, no la clave `splash` del config). Para añadir paquetes usa siempre:
```bash
cd apps/vooxie && npx expo install <paquete>
```
`expo-av` fue eliminado: todo el audio usa `expo-audio`.

## 4. Variables de entorno
| Dónde | Variables | Notas |
|---|---|---|
| **App** (`.env`) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | públicas (van al bundle) |
| **Supabase** (secretos de la función) | `YTDLP_SERVICE_URL`, `YTDLP_SERVICE_TOKEN`, `ALLOWED_ORIGINS` (opc.) | `supabase secrets set --env-file supabase/functions/.env` |
| **Microservicio** | `SERVICE_AUTH_TOKEN` (≥24 chars), `PORT` | `openssl rand -hex 32` |

`YTDLP_SERVICE_TOKEN` (Supabase) debe ser igual a `SERVICE_AUTH_TOKEN` (servicio).
**Nunca** pongas `service_role` ni los datos del microservicio como `EXPO_PUBLIC_*`.

## 5. Supabase
```bash
supabase start                      # local
supabase db reset                   # aplica migrations/0001…0006
supabase db push                    # proyecto remoto (tras `supabase link`)
```
Migración **0006** (`youtube_tracks_cache`): constraints, índices, trigger `updated_at`, RLS (la app solo
**lee**), tabla `admin_users` y RPC `admin_set_track_extras` (única vía para editar Canvas/productores).
Hacer admin a un usuario (SQL editor):
```sql
insert into public.admin_users (user_id) values ('<uuid del usuario>');
```

### Catálogo de artistas, álbumes y colaboraciones (migración 0007)
```
artist_profiles ─┬─ albums (álbum/EP/single, portada, fecha)
                 │     └─ tracks (track_number, youtube_id) ──▶ audio vía resolveTrack
                 └─ track_artists (primary / featured) ──▶ colaboraciones
```
- Se reutilizan `artist_profiles`, `albums` y `tracks`. Los artistas importados tienen `origin = 'catalog'` y `user_id = null`
  (el artista real podrá reclamarlo después). Las canciones importadas usan `youtube_id` en lugar de `audio_url`.
- La app solo **lee**. Importar/editar catálogo es solo `service_role` (importador/admin); los triggers impiden que un usuario
  se auto-asigne `origin`, `musicbrainz_id`, `youtube_id` o `monthly_listeners`.
- `search_artists(q)`: devuelve artistas ordenados exacto > empieza por > contiene, luego verificados y más oyentes (para que el
  perfil salga primero al buscar). Vista `artist_tracks`: todas las canciones del artista (principal + feat), recientes primero.
- Prueba SQL: `pnpm test:sql` (requiere `@electric-sql/pglite`).
- Migración **0008**: columnas `deezer_id` / `isrc` para el importador (protegidas contra escritura de usuarios).

### Importador de artistas (Deezer) — `services/importer`
Trae foto, oyentes (fans de Deezer), álbumes/EP/singles con portada, canciones, colaboraciones (feat) y las empareja con un
`youtube_id` usando el servicio yt-dlp (`/search`, con el filtro de solo música). Se corre **una vez por artista**, en tu máquina:
```bash
export SUPABASE_URL=https://TU-PROYECTO.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...        # solo en tu terminal, NUNCA en la app
export YTDLP_SERVICE_URL=https://TU-SERVICIO-YTDLP.example.com
export YTDLP_SERVICE_TOKEN=...
pnpm import:artist -- "Anuel AA" "Feid" "Eladio Carrion"
pnpm import:artist -- --deezer-id 7234 --max-albums 20     # id exacto si el nombre es ambiguo
pnpm import:artist -- "Karol G" --no-match                 # prueba sin buscar audio (no inserta canciones)
```
- Idempotente: volver a correrlo actualiza, no duplica. Una canción sin audio emparejado **no se inserta** (se reporta como
  "sin audio"); al re-ejecutar se reintenta.
- No pisa lo editado a mano (foto subida, `youtube_id` ya asignado).
- Las canciones de otros artistas donde participa el artista (colaboraciones) se importan desde sus "top tracks".
- La URL de la foto se guarda tal cual la entrega Deezer (no se copia la imagen). Revisa los términos de Deezer antes de publicar.
- Esquema de respuestas de Deezer tomado de documentación de terceros: **no se probó contra Deezer real** desde el entorno de
  desarrollo. Si Deezer cambia un campo, ajusta `src/map.mjs`.

### Qué ve el usuario
- **Buscar "anuel":** el perfil de Anuel sale primero (avatar grande), luego canciones y álbumes. Tocar el perfil abre foto,
  oyentes, lanzamientos recientes, canciones populares, discografía (álbum/EP/sencillo + año) y colaboraciones.
- **Historial ("Escuchado recientemente"):** solo se guarda lo que se **reproduce** (canción) o se **abre** (perfil de artista).
  Escribir "bby wow" sin tocar nada no guarda nada; reproducir "Ahora Me Llama" guarda esa canción. Se guarda en el dispositivo
  (AsyncStorage), no se sincroniza entre dispositivos.
- Las canciones importadas se reproducen con el mismo pipeline (`youtube_id` → resolveTrack → expo-audio).

## 6. Edge Function
```bash
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy youtube-proxy      # verify_jwt = true (config.toml)
```
Acciones (`POST`, requiere sesión): `{"action":"search","query":"…"}` y `{"action":"resolve","videoId":"…"}`.
Errores: `{"success":false,"code":"…","message":"…"}` con códigos `INVALID_REQUEST, UNAUTHORIZED, RATE_LIMITED,
TRACK_NOT_FOUND, SEARCH_FAILED, EXTRACT_FAILED, STREAM_RESOLUTION_FAILED, STREAM_EXPIRED, UPSTREAM_TIMEOUT, CACHE_ERROR`.
**CORS:** las apps nativas no usan CORS (no envían `Origin`), por eso no se devuelve
`Access-Control-Allow-Origin` por defecto; solo los orígenes web listados en `ALLOWED_ORIGINS` lo reciben (nunca `*`).

## 7. Microservicio yt-dlp (`services/yt-dlp`)
```bash
cd services/yt-dlp
docker build -t vooxie-ytdlp .
docker run -p 8080:8080 -e SERVICE_AUTH_TOKEN=$(openssl rand -hex 32) vooxie-ytdlp
curl -s localhost:8080/healthz
```
- `POST /search {"query"}` → `{success, items:[{videoId,title,artist,artworkUrl,duration}]}`
- `POST /extract {"videoId"}` → `{success, …, streamUrl, streamExpiresAt, producers:[]}`
- Auth `Authorization: Bearer <SERVICE_AUTH_TOKEN>`; valida `videoId` (`^[A-Za-z0-9_-]{11}$`), timeouts reales
  (proceso hijo que se mata), límite de concurrencia, deduplicación por `videoId`.
- `MUSIC_ONLY=true` (por defecto): la búsqueda descarta entrevistas, reacciones, podcasts, shorts, directos y videos de <1 min o >10 min,
  y prioriza canales "- Topic", VEVO y versiones oficiales. Filtro por reglas sobre título/canal/duración (no es infalible).
- Formato de audio: m4a/AAC primero (compatible iOS + Android). `streamExpiresAt` sale del parámetro `expire` de la URL
  menos 5 min de margen. `producers` siempre `[]` (no se inventan).
- Despliégalo en cualquier host de contenedores con HTTPS (Fly.io, Railway, Cloud Run…). Reconstruye la imagen
  periódicamente: yt-dlp cambia con frecuencia.
- Uso: solo contenido para el que tengas derechos; no hay DRM-bypass ni evasión de controles técnicos.

## 8. Desarrollo y validación
```bash
pnpm vooxie                 # app oyentes
pnpm vooxie:artistas        # app artistas
pnpm typecheck && pnpm lint
pnpm test                   # mapper + toPlayable + Edge Function + importador (Node) + microservicio (requiere `pip install -r services/yt-dlp/requirements-dev.txt`)
cd apps/vooxie && npx expo-doctor
```

## 9. iOS / Android / Build
- iOS: `bundleIdentifier com.vooxie.app`, `UIBackgroundModes: audio`. Android: `package com.vooxie.app`, permisos
  `FOREGROUND_SERVICE(_MEDIA_PLAYBACK)`; **sin** micrófono/RECORD_AUDIO.
- `cd apps/vooxie && npx expo run:ios` / `npx expo run:android`, o `eas build`.
- Los assets de `assets/` son placeholders: reemplázalos antes de publicar.

## 10. Reproductor — comportamiento y límites
- Un solo `AudioEngine` (expo-audio) + `TrackResolver` (nivel superior). El player solo reproduce una URL; si falla, informa y el resolver renueva el stream y reanuda en la misma posición (máx. 2 intentos). Si la resolución falla, **no reintenta sola**: tocar play reintenta.
- Si el recurso no carga en 25 s se trata como fallo del stream.
- Un rebuffering ya no se interpreta como pausa; una pausa externa (auriculares, llamada, control remoto) sí se refleja.
- Cambios rápidos A→B→C: respuestas tardías de A/B no pisan a C (probado en `usePlayerStore.test.ts` y `resolverPolicy.test.ts`).
- **Límites conocidos:** la pantalla de bloqueo muestra play/pause/seek (siguiente/anterior no están conectados); no hay precarga de la siguiente canción, así que puede haber un corto silencio al resolver el stream de la próxima; el modo "video" de YouTube ya no existe. **No se probó en un dispositivo real.**

## 11. Problemas comunes
| Síntoma | Causa / solución |
|---|---|
| `UNAUTHORIZED` al buscar en YouTube | no hay sesión de VooXiE; inicia sesión |
| `EXTRACT_FAILED` siempre | `YTDLP_SERVICE_TOKEN` ≠ `SERVICE_AUTH_TOKEN`, o URL del servicio mal |
| `UPSTREAM_TIMEOUT` | yt-dlp lento/bloqueado; revisa logs del servicio y actualiza yt-dlp |
| Canvas no se guarda | tu usuario no está en `admin_users` |
| Metro no encuentra `@vooxie/*` | no sobreescribas `disableHierarchicalLookup`/`unstable_enableSymlinks` (SDK 57 ya lo hace) |
| Falla un stream a mitad de canción | el resolver renueva el stream y reanuda en la misma posición (máx. 2 intentos) |

## Estructura
```
apps/vooxie · apps/vooxie-artistas    apps Expo Router
packages/core · packages/ui · packages/config
services/yt-dlp                       microservicio (Python/FastAPI + Docker)
services/importer                     importador Deezer → Supabase
supabase/{migrations,functions/youtube-proxy,config.toml}
```
