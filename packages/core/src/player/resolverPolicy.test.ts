// Ejecutar:  npx tsx --test packages/core/src/player/resolverPolicy.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_FORCED_REFRESHES, planResolve, type ResolverInput } from "./resolverPolicy";

const base: ResolverInput = { id: "dQw4w9WgXcQ", kind: "youtube", needsStream: false, error: null, failed: false, forcedCount: 0 };
const plan = (o: Partial<ResolverInput>) => planResolve({ ...base, ...o });

test("sin track o no-YouTube: nada", () => {
  assert.deepEqual(plan({ id: null }), { type: "none" });
  assert.deepEqual(plan({ kind: null, needsStream: true }), { type: "none" });
});
test("stream válido y sin error: nada", () => assert.deepEqual(plan({}), { type: "none" }));
test("falta stream: resuelve una vez", () =>
  assert.deepEqual(plan({ needsStream: true }), { type: "resolve", stale: null, forced: false }));
test("falló la resolución: NO reintenta sola (sin bucle)", () =>
  assert.deepEqual(plan({ needsStream: true, failed: true }), { type: "none" }));
test("error de reproducción: renueva con la url vencida", () =>
  assert.deepEqual(plan({ error: { streamUrl: "https://old" } }), { type: "resolve", stale: "https://old", forced: true }));
test("tras 2 renovaciones forzadas: se rinde", () => {
  assert.deepEqual(plan({ error: { streamUrl: "https://old" }, forcedCount: MAX_FORCED_REFRESHES }), { type: "give_up" });
});
test("reintento manual siempre intenta, aunque haya fallado antes", () =>
  assert.deepEqual(plan({ needsStream: true, failed: true, forcedCount: 9, error: { streamUrl: null, manual: true } }),
    { type: "resolve", stale: null, forced: true }));

test("audius: no resuelve por sí solo, solo ante un error de reproducción", () => {
  assert.deepEqual(plan({ kind: "audius", needsStream: true }), { type: "none" });
  assert.deepEqual(plan({ kind: "audius", error: { streamUrl: "https://host/stream" } }), { type: "resolve", stale: "https://host/stream", forced: true });
  assert.deepEqual(plan({ kind: "audius", error: { streamUrl: "x" }, forcedCount: MAX_FORCED_REFRESHES }), { type: "give_up" });
});
