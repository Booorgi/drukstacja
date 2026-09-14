import catalog from "./filamentCatalog.json";

export const FILAMENT_CATEGORIES = {
  PLA_STANDARD: "PLA",
  PLA_WOOD: "PLA Wood",
  PLA_SILK_DUAL: "Silk Dual-Color",
  PLA_SILK_TRI: "Silk Tri-Color",
  PLA_GALAXY: "PLA Galaxy",
  PLA_RAINBOW: "PLA Rainbow",
};

const pla = (catalog.families || []).find((f) => f.id === "PLA");

export const FILAMENTS = (pla?.subtypes || []).flatMap((subtype) =>
  (subtype.colors || []).map((color) => ({
    id: color.id,
    name: color.name,
    category: subtype.category,
    hex: color.hex,
    gradient: color.gradient,
    colors: color.colors,
    type: "PLA",
    nozzleTemp: subtype.nozzleTemp,
    bedTemp: subtype.bedTemp,
    density: subtype.density,
    transparent: color.transparent || false,
  }))
);

export function getFilamentById(id) {
  if (!id) return null;
  return FILAMENTS.find((f) => f.id === id) || null;
}

export function getFilamentByHex(hex) {
  if (!hex) return null;
  const clean = hex.trim().toUpperCase();
  return FILAMENTS.find((f) => String(f.hex || "").toUpperCase() === clean) || null;
}
