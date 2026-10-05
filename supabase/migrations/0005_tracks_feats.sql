-- Migración 0005: campo feats en tracks
-- ─────────────────────────────────────────────────────────────────────────────
-- Agrega feats text[] (nombres en texto libre) para almacenar colaboradores de
-- una canción (sección 14 de Fase 3). No se crea ninguna tabla nueva — los
-- colaboradores como cuentas reales se resolverán en fases futuras.
-- La columna es nullable/default vacío para no romper tracks existentes.
--
-- Para regenerar los tipos después de aplicar esta migración:
--   supabase gen types typescript --local > packages/core/src/supabase/types.generated.ts

alter table public.tracks
  add column if not exists feats text[] not null default '{}';
