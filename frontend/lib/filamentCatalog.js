import catalog from "../config/filamentCatalog.json";
import { commercialUnitPrice, parsePrintTimeHours } from "./commercialPricing";

export const STUDIO_FAMILIES = catalog.families;
export const STL_MATERIALS = catalog.materials;

export function familyById(familyId) {
  return STUDIO_FAMILIES.find((f) => f.id === familyId) || STUDIO_FAMILIES[0];
}

export function materialById(materialId) {
  if (!materialId) return STL_MATERIALS[0];
  const needle = String(materialId);
  return (
    STL_MATERIALS.find(
      (m) =>
        m.id === needle ||
        m.id.toLowerCase() === needle.toLowerCase() ||
        (m.aliases || []).some((al) => String(al).toLowerCase() === needle.toLowerCase())
    ) || STL_MATERIALS[0]
  );
}

export function familyForMaterial(material) {
  const id = material?.familyId;
  return STUDIO_FAMILIES.find((f) => f.id === id) || familyById("PLA");
}

export function studioFamiliesForWheel() {
  return STUDIO_FAMILIES.map((family) => {
    const first = family.subtypes[0];
    const swatch = first?.colors?.[0] || {};
    return {
      id: family.id,
      name: family.name,
      hex: swatch.hex || "#888888",
      gradient: swatch.gradient,
      subtypeCount: family.subtypes.length,
      group: family.group,
    };
  });
}

export function materialIdFromFilamentType(type) {
  const t = String(type || "").toUpperCase().replace(/[_-]+/g, " ");
  const rules = [
    ["PA12", "PA12_CF"],
    ["PA 12", "PA12_CF"],
    ["PA6 CF", "PA6_CF"],
    ["PA 6", "PA6_CF"],
    ["EASY PA", "EASY_PA"],
    ["PETG FR", "PETG_FR"],
    ["PETG CF", "PETG_CF"],
    ["PETG CARBON", "PETG_CF"],
    ["ABS GF", "ABS_GF"],
    ["ABS FR", "ABS_FR"],
    ["TPU", "TPU_95A"],
    ["FLEX", "TPU_95A"],
    ["PCTG", "PCTG"],
    ["ASA", "ASA"],
    ["PC", "PC"],
    ["PP", "PP"],
    ["PETG", "PETG"],
    ["ABS", "ABS"],
    ["WOOD", "PLA_WOOD"],
    ["DUAL", "PLA_SILK_DUAL"],
    ["TRI", "PLA_TRI"],
    ["GALAXY", "PLA_GALAXY"],
    ["RAINBOW", "PLA_RAINBOW"],
    ["SILK", "PLA_SILK_DUAL"],
    ["PLA", "PLA_STANDARD"],
  ];
  for (const [token, id] of rules) {
    if (t.includes(token)) return id;
  }
  return "PLA_STANDARD";
}

export function quoteUnitPriceFromWeight({
  weightG,
  volumeCm3,
  infill = 20,
  density = 1.24,
  ratePerG = 0.045,
  layerMultiplier = 1,
  nozzleMultiplier = 1,
  printTimeHours = 0,
  printTimeFormatted,
}) {
  let grams = Number(weightG);
  if (!Number.isFinite(grams) || grams <= 0.05) {
    const volume = Number(volumeCm3) || 0;
    const perimeterRatio = 0.72;
    const infillRatio = (infill / 100) * (1.0 - perimeterRatio);
    const effectiveVolCm3 = volume * (perimeterRatio + infillRatio);
    grams = effectiveVolCm3 * density * 1.42;
  }
  return commercialUnitPrice({
    weightG: grams,
    printTimeHours: parsePrintTimeHours(printTimeFormatted, printTimeHours),
    ratePerG,
    layerMultiplier,
    nozzleMultiplier,
  });
}

export function plaKeychainFilaments() {
  const pla = STUDIO_FAMILIES.find((f) => f.id === "PLA");
  const grouped = {};
  for (const subtype of pla?.subtypes || []) {
    const key = subtype.id.replace("PLA_", "");
    grouped[key] = (subtype.colors || []).map((c) => ({
      ...c,
      tier: subtype.tier,
      type: "PLA",
      category: subtype.category,
      family: "PLA",
      subtype: subtype.id,
      in_stock: true,
      roughness: subtype.roughness,
      metalness: subtype.metalness,
    }));
  }
  return grouped;
}
