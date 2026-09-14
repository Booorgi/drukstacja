import { plaKeychainFilaments } from "./filamentCatalog";

export { STL_MATERIALS, STUDIO_FAMILIES } from "./filamentCatalog";

// =========================================================================
// DRUKSTACJA - BAZA MATERIAŁÓW I FILAMENTÓW
// Podział na:
// 1. Paleta breloków (PLA: Standard, Wood, Dual, Tri, Galaxy, Rainbow)
// 2. Katalog wyceniarki STL — rodziny + podtypy (filamentCatalog.js)
// =========================================================================

// -------------------------------------------------------------------------
// 1. DEDYKOWANA PALETA GENERATORA BRELOKÓW (Płaskorzeźby i Breloki Multi-Color)
// -------------------------------------------------------------------------
export const KEYCHAIN_CATEGORIES = [
  { id: "ALL", label: "Wszystkie", finishName: "PLA", desc: "Pełna paleta PLA" },
  { id: "CLASSIC", label: "Klasyczny", finishName: "PLA Standard", badge: "Gładki", desc: "Standardowe Sunlu PLA" },
  { id: "WOOD", label: "Wood", finishName: "PLA Wood", badge: "Drewno", desc: "Z domieszką pyłu drzewnego" },
  { id: "DUAL", label: "Dual-Color", finishName: "PLA Silk dual", badge: "Dwuton", desc: "Filament dwukolorowy" },
  { id: "TRI", label: "Tri-Color", finishName: "PLA Tri color", badge: "3-kolory", desc: "Filament trójkolorowy" },
  { id: "GALAXY", label: "Galaxy", finishName: "PLA Galaxy", badge: "Galaxy", desc: "Efekt galaktyki" },
  { id: "RAINBOW", label: "Rainbow", finishName: "PLA Rainbow", badge: "Tęcza", desc: "Wielokolorowy gradient" },
];

// Sprawdza, czy dany filament jest bezpiecznym tworzywem PLA dla breloków (eliminuje PET-G, TPU, ASA itp.)
export function isPlaFilament(f) {
  if (!f) return false;
  const hay = [f.type, f.category, f.name, f.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  const blocked = [
    "pet g",
    "petg",
    "tpu",
    "flex",
    "asa",
    "abs",
    "pctg",
    "nylon",
    "pa12",
    "pa 12",
    "polipropylen",
    "composite",
    "carbon fiber",
    "tech",
  ];
  if (blocked.some((token) => hay.includes(token))) return false;

  const type = String(f.type || "").toUpperCase().replace(/[_-]+/g, " ").trim();
  if (type.startsWith("PLA") || ["SILK", "WOOD", "MULTICOLOR"].includes(type)) return true;
  if (/\bpla\b/.test(hay)) return true;

  const cat = String(f.category || "").toLowerCase();
  if (["dual", "tri", "rainbow", "pla wood", "silk dual-color", "silk tri-color", "pla galaxy", "pla rainbow"].includes(cat)) {
    return true;
  }

  return false;
}

// Rozpoznaje typ wykończenia PLA (Klasyczny, Matte, Silk, Dual, Tri, Rainbow, Wood)
export function getPlaFinishType(f) {
  if (!f) return "CLASSIC";
  const cat = (f.category || "").toLowerCase();
  const type = (f.type || "").toUpperCase();
  const name = (f.name || "").toLowerCase();
  const id = (f.id || "").toLowerCase();

  if (cat === "dual" || cat === "silk dual-color" || id.includes("dual") || name.includes("dual")) return "DUAL";
  if (cat === "tri" || cat === "silk tri-color" || id.includes("tri") || name.includes("tri")) return "TRI";
  if (cat === "rainbow" || cat === "pla rainbow" || id.includes("rainbow") || name.includes("rainbow") || name.includes("tęcza")) return "RAINBOW";
  if (cat === "pla galaxy" || id.includes("galaxy") || name.includes("galaxy")) return "GALAXY";
  if (type === "WOOD" || cat === "pla wood" || id.includes("wood") || name.includes("drewno") || name.includes("wood")) return "WOOD";
  if (type === "SILK" || id.includes("silk") || name.includes("silk") || name.includes("jedwab")) return "DUAL";
  if (
    id.includes("mat_") ||
    name.includes("matte") ||
    name.includes("matowy") ||
    name.includes("satin") ||
    name.includes("satynow") ||
    (type === "PLA" && (f.roughness ?? 0) >= 0.6)
  ) {
    return "MATTE";
  }
  return "CLASSIC";
}

// Zwraca przyjazną etykietę wykończenia dla belki pod próbkami
export function getPlaFinishLabel(f) {
  const finish = getPlaFinishType(f);
  switch (finish) {
    case "MATTE":
      return "PLA Matte";
    case "SILK":
      return "PLA Silk";
    case "DUAL":
      return "PLA Dual-Color";
    case "TRI":
      return "PLA Tri-Color";
    case "RAINBOW":
      return "PLA Rainbow";
    case "GALAXY":
      return "PLA Galaxy";
    case "WOOD":
      return "PLA Wood";
    case "CLASSIC":
    default:
      return "PLA Klasyczny";
  }
}

const _plaKc = plaKeychainFilaments();
export const KEYCHAIN_FILAMENTS = {
  PLA: _plaKc.STANDARD || [],
  WOOD: _plaKc.WOOD || [],
  DUAL: _plaKc.SILK_DUAL || [],
  TRI: _plaKc.TRI || [],
  GALAXY: _plaKc.GALAXY || [],
  RAINBOW: _plaKc.RAINBOW || [],
};

// Spłaszczona lista kolorów brelokowych (używana m.in. do autodetekcji kolorów AI)
export const ALL_KEYCHAIN_COLORS = Object.values(KEYCHAIN_FILAMENTS).flat();

// Funkcja pomocnicza do pobierania filamentów z backendu FastAPI / PostgreSQL z automatycznym fallbackiem
export async function fetchFilamentsFromApi(apiUrl = process.env.NEXT_PUBLIC_API_URL) {
  try {
    const base = apiUrl ? apiUrl.replace(/\/+$/, "") : "";
    const res = await fetch(`${base}/api/filaments`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.filaments) && data.filaments.length > 0) {
      return data.filaments;
    }
  } catch (err) {
    console.warn("Nie udało się pobrać filamentów z bazy PostgreSQL (Railway), używam danych lokalnych:", err);
  }
  return ALL_KEYCHAIN_COLORS;
}

// Kompatybilność wsteczna z poprzednimi odwołaniami
export const SUNLU_CATALOG = {
  categories: KEYCHAIN_CATEGORIES,
  colors: {
    PLA_PLUS: KEYCHAIN_FILAMENTS.PLA,
    SILK_PLA: KEYCHAIN_FILAMENTS.DUAL,
    PETG: KEYCHAIN_FILAMENTS.PLA,
    DUAL_COLOR: KEYCHAIN_FILAMENTS.DUAL,
    TRI_COLOR: KEYCHAIN_FILAMENTS.TRI,
    RAINBOW: KEYCHAIN_FILAMENTS.RAINBOW,
    WOOD: KEYCHAIN_FILAMENTS.WOOD,
    GALAXY: KEYCHAIN_FILAMENTS.GALAXY,
  }
};


// -------------------------------------------------------------------------
// 2. KATALOG WYCENIARKI — rodziny + podtypy w filamentCatalog.js / JSON
// -------------------------------------------------------------------------
export const STL_MATERIAL_GROUPS = [
  { id: "all", label: "Wszystkie" },
  { id: "standard", label: "Podstawowe & Wizualne", desc: "PLA, PETG" },
  { id: "tech", label: "Techniczne & Outdoor", desc: "ABS, ASA, PA, PC, PCTG, TPU" },
];

// Backwards compatibility aliases
export const FILAMENT_DATABASE = ALL_KEYCHAIN_COLORS;
export const TIERS = [
  { id: "all", label: "Wszystkie" },
  { id: "standard", label: "PLA Standard" },
  { id: "premium", label: "Silk / Wood / Dual" }
];
export const MATERIAL_TYPES = KEYCHAIN_CATEGORIES;