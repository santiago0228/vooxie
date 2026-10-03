// Solo para tests en Node: sustituye el servicio de catálogo (que arrastra react-native/Supabase)
// por un stub, así el store se puede ejercitar sin dispositivo.
const path = require("path");
const target = path.resolve(__dirname, "../catalog/catalogService.ts");
require.cache[target] = {
  id: target, filename: target, loaded: true, children: [], paths: [],
  exports: { incrementTrackPlays: () => {} },
};
