/** Bazowa gęstość filamentu z wyceny Orca / Bambu (PLA ~1.24 g/cm³). */
export const BASE_FILAMENT_DENSITY = 1.24;

export function normalizeAmsColours(colours) {
  if (!Array.isArray(colours)) return [];
  return colours.filter((c) => typeof c === "string" && c.startsWith("#"));
}

export function updateAmsSlot(colours, index, hex) {
  const next = normalizeAmsColours(colours);
  if (typeof hex !== "string" || !hex.startsWith("#")) {
    return next;
  }
  if (index < 0) return next;
  while (next.length <= index) {
    next.push(hex);
  }
  next[index] = hex;
  return next;
}

/** Zamień slot, startując od bieżących kolorów UI (nie pustej tablicy stanu). */
export function replaceAmsSlot(currentColours, fallbackColours, index, hex) {
  const base = normalizeAmsColours(currentColours);
  const seed = base.length ? base : normalizeAmsColours(fallbackColours);
  return updateAmsSlot(seed, index, hex);
}

export function scaleWeightForDensity(weightG, density, base = BASE_FILAMENT_DENSITY) {
  const w = Number(weightG) || 0;
  const d = Number(density) || base;
  if (w <= 0 || !Number.isFinite(d) || d <= 0) return w;
  return Math.round(w * (d / base) * 10) / 10;
}

export function scaleLengthForDensity(lengthM, density, base = BASE_FILAMENT_DENSITY) {
  const len = Number(lengthM) || 0;
  const d = Number(density) || base;
  if (len <= 0 || !Number.isFinite(d) || d <= 0) return len;
  return Math.round(len * (d / base) * 100) / 100;
}

export function formatAmsMaterialLabel(materialName, colours) {
  const name = String(materialName || "PLA").trim() || "PLA";
  const hexes = normalizeAmsColours(colours);
  if (!hexes.length) return name;
  return `${name} (AMS: ${hexes.join(", ")})`;
}
