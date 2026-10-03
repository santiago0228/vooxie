/**
 * useDominantColor — extrae el color dominante de la portada.
 *
 * Estrategia multi-capa compatible con iOS, Android y Expo Go:
 *
 * 1. Extracción via Canvas API (funciona en Expo Go / web / simulador).
 * 2. Fallback a paleta derivada del hash de la URL (determinista, sin canvas).
 * 3. Default elegante si todo falla.
 *
 * Para producción nativa real: instalar react-native-image-colors
 * y reemplazar la rama de canvas con su API nativa. Esta implementación
 * es segura y no crashea en ningún entorno.
 */

import { useState, useEffect, useRef } from "react";

export type AtmosphereColors = {
  bg: string;       // Fondo principal muy oscuro
  bgMid: string;    // Fondo intermedio para degradado
  accent: string;   // Color de acento suave
  textMuted: string;
};

const DEFAULT: AtmosphereColors = {
  bg: "#070A10",
  bgMid: "#0B0F17",
  accent: "rgba(255,255,255,0.6)",
  textMuted: "rgba(255,255,255,0.4)",
};

/**
 * Caché global de colores por URL.
 * Compartido entre el reproductor y el MiniPlayer:
 * cuando el player ya calculó el color, el MiniPlayer lo obtiene
 * directamente sin recalcular.
 */
const colorCache = new Map<string, AtmosphereColors>();

/** Lee el color cacheado para una URL (síncrono, para el MiniPlayer). */
export function getCachedAtmosphere(url: string | null | undefined): AtmosphereColors {
  if (!url) return DEFAULT;
  return colorCache.get(url) ?? DEFAULT;
}

/** Convierte RGB a HSL */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Genera atmósfera desde H, S, L */
function buildAtmosphere(h: number, s: number): AtmosphereColors {
  const sBg = Math.min(s * 0.55, 38);
  const sAccent = Math.min(s * 0.75, 52);
  return {
    bg: `hsl(${h}, ${sBg}%, 5%)`,
    bgMid: `hsl(${h}, ${sBg * 0.75}%, 9%)`,
    accent: `hsl(${h}, ${sAccent}%, 58%)`,
    textMuted: `hsl(${h}, ${sBg * 0.4}%, 52%)`,
  };
}

/**
 * Fallback: genera una atmósfera determinista desde el hash de la URL.
 * Siempre produce el mismo color para la misma URL, sin necesitar canvas.
 * Útil en builds nativos donde canvas no está disponible.
 */
function atmosphereFromUrlHash(url: string): AtmosphereColors {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  // Mapear el hash a una matiz (hue) entre 0-360, con saturación moderada
  const hue = Math.abs(hash % 360);
  const sat = 25 + Math.abs((hash >> 8) % 30); // 25–55%
  return buildAtmosphere(hue, sat);
}

/** Extrae color via Canvas (Expo Go, web, simulador). */
async function extractViaCanvas(url: string): Promise<AtmosphereColors | null> {
  return new Promise((resolve) => {
    try {
      const img = new (globalThis as any).Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const SIZE = 48;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

          // Cuantización a buckets de 32 por canal
          const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
          for (let i = 0; i < data.length; i += 4) {
            const r = Math.floor(data[i] / 32) * 32;
            const g = Math.floor(data[i + 1] / 32) * 32;
            const b = Math.floor(data[i + 2] / 32) * 32;
            const br = (r + g + b) / 3;
            if (br < 18 || br > 215) continue; // skip negro/blanco puros
            const key = `${r},${g},${b}`;
            if (!buckets[key]) buckets[key] = { r, g, b, count: 0 };
            buckets[key].count++;
          }

          let best = { r: 80, g: 80, b: 80, count: 0 };
          for (const b of Object.values(buckets)) {
            if (b.count > best.count) best = b;
          }

          const [h, s] = rgbToHsl(best.r, best.g, best.b);
          const atm = buildAtmosphere(h, s);
          colorCache.set(url, atm);
          resolve(atm);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null); // Image API no disponible (nativo sin canvas)
    }
  });
}

export function useDominantColor(coverUrl: string | null | undefined): AtmosphereColors {
  const [colors, setColors] = useState<AtmosphereColors>(DEFAULT);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!coverUrl || coverUrl === prevUrl.current) return;
    prevUrl.current = coverUrl;

    // Reset inmediato al cambiar canción
    setColors(DEFAULT);

    // 1. Intentar Canvas (Expo Go / web)
    extractViaCanvas(coverUrl).then((result) => {
      if (result) {
        setColors(result);
      } else {
        // 2. Fallback determinista por hash de URL (nativo sin canvas)
        const hashAtm = atmosphereFromUrlHash(coverUrl);
        colorCache.set(coverUrl, hashAtm);
        setColors(hashAtm);
      }
    });
  }, [coverUrl]);

  return colors;
}
