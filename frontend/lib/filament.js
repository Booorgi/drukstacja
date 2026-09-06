// =========================================================================
// DRUKSTACJA - BAZA MATERIAŁÓW I FILAMENTÓW
// Podział na:
// 1. Dedykowana paleta breloków (PLA, Matte, Silk, Wood, Dual, Tri, Rainbow)
// 2. Pełny katalog inżynieryjny dla wyceniarki modeli 3D / STL (Standard, Tech, Flex, CF)
// =========================================================================

// -------------------------------------------------------------------------
// 1. DEDYKOWANA PALETA GENERATORA BRELOKÓW (Płaskorzeźby i Breloki Multi-Color)
// -------------------------------------------------------------------------
export const KEYCHAIN_CATEGORIES = [
  { id: "ALL", label: "Wszystkie", finishName: "PLA", desc: "Pełna paleta PLA" },
  { id: "CLASSIC", label: "Klasyczny", finishName: "PLA Klasyczny", badge: "Gładki", desc: "Standardowe gładkie PLA" },
  { id: "MATTE", label: "Matte", finishName: "PLA Matte", badge: "Aksamit", desc: "Matowe, aksamitne wykończenie" },
  { id: "SILK", label: "Silk", finishName: "PLA Silk", badge: "Połysk", desc: "Metaliczny / jedwabisty połysk" },
  { id: "DUAL", label: "Dual-Color", finishName: "PLA Dual-Color", badge: "Dwuton", desc: "Filament dwukolorowy dwutonalny" },
  { id: "TRI", label: "Tri-Color", finishName: "PLA Tri-Color", badge: "3-kolory", desc: "Filament trójkolorowy" },
  { id: "RAINBOW", label: "Rainbow", finishName: "PLA Rainbow", badge: "Tęcza", desc: "Wielokolorowy gradient" },
  { id: "WOOD", label: "Wood", finishName: "PLA Wood", badge: "Drewno", desc: "Z domieszką pyłu drzewnego" },
];

// Sprawdza, czy dany filament jest bezpiecznym tworzywem PLA dla breloków (eliminuje PET-G, TPU, ASA itp.)
export function isPlaFilament(f) {
  if (!f) return false;
  const type = (f.type || "").toUpperCase();
  const name = (f.name || "").toLowerCase();

  const nonPlaTypes = ["PETG", "PET-G", "FLEX", "TPU", "TECH", "ASA", "ABS", "PCTG", "PP", "COMPOSITE", "CARBON", "NYLON"];
  if (nonPlaTypes.includes(type)) return false;

  if (
    name.includes("pet-g") ||
    name.includes("petg") ||
    name.includes("tpu") ||
    name.includes("flex") ||
    name.includes("asa") ||
    name.includes("abs") ||
    name.includes("pctg") ||
    name.includes("carbon") ||
    name.includes("nylon") ||
    name.includes("polipropylen")
  ) {
    return false;
  }

  return true;
}

// Rozpoznaje typ wykończenia PLA (Klasyczny, Matte, Silk, Dual, Tri, Rainbow, Wood)
export function getPlaFinishType(f) {
  if (!f) return "CLASSIC";
  const cat = (f.category || "").toLowerCase();
  const type = (f.type || "").toUpperCase();
  const name = (f.name || "").toLowerCase();
  const id = (f.id || "").toLowerCase();

  if (cat === "dual" || id.includes("dual") || name.includes("dual")) return "DUAL";
  if (cat === "tri" || id.includes("tri") || name.includes("tri")) return "TRI";
  if (cat === "rainbow" || id.includes("rainbow") || name.includes("rainbow") || name.includes("tęcza")) return "RAINBOW";
  if (type === "WOOD" || id.includes("wood") || name.includes("drewno")) return "WOOD";
  if (type === "SILK" || id.includes("silk") || name.includes("silk") || name.includes("jedwab")) return "SILK";
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
    case "WOOD":
      return "PLA Wood";
    case "CLASSIC":
    default:
      return "PLA Klasyczny";
  }
}

export const KEYCHAIN_FILAMENTS = {
  PLA: [
    { id: "kc_pla_white", name: "Czysta Biel", hex: "#E6E6E2", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_bone", name: "Kość Słoniowa", hex: "#ECE4D8", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_black", name: "Głęboka Czerń", hex: "#222222", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_grey", name: "Szary Standard", hex: "#6B6E6E", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_dark_gray", name: "Ciemnoszary", hex: "#474A4D", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_red", name: "Ognista Czerwień", hex: "#B34044", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_dark_red", name: "Bordo / Ciemnoczerwony", hex: "#8A171A", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_blue", name: "Kobaltowy Błękit", hex: "#0063A0", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_sky", name: "Błękit Nieba", hex: "#0CB7CC", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_navy", name: "Granatowy", hex: "#133E7C", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_green", name: "Żywa Zieleń", hex: "#4EE349", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_dark_green", name: "Ciemna Zieleń", hex: "#145A32", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_yellow", name: "Czysty Żółty", hex: "#FFBD2C", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_orange", name: "Pomarańczowy", hex: "#E65C00", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_purple", name: "Fiolet", hex: "#8887C5", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_pink", name: "Różowy", hex: "#E881A6", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_skin", name: "Cielisty Beż", hex: "#F7BEA1", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_brown", name: "Ciepły Brąz", hex: "#8E6B4E", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_silver", name: "Srebrny", hex: "#8A8D8F", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_gold", name: "Złoty Standard", hex: "#D4AF37", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
    { id: "kc_pla_copper", name: "Miedź Standard", hex: "#A0522D", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.38, roughness: 0.40, metalness: 0.05, in_stock: true },
  ],
  MATTE: [
    { id: "kc_mat_white", name: "Matte Czysta Biel", hex: "#F1F2F6", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_black", name: "Matte Głęboka Czerń", hex: "#1E1E1E", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_gray", name: "Matte Szary Neutralny", hex: "#747D8C", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_graphite", name: "Matte Grafit Ciemny", hex: "#2F3542", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_red", name: "Matte Karminowa Czerwień", hex: "#FF4757", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_blue", name: "Matte Błękit Kobalt", hex: "#1E90FF", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_green", name: "Matte Soczysta Zieleń", hex: "#2ED573", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_yellow", name: "Matte Ciepły Żółty", hex: "#FFA502", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.90, metalness: 0.0, in_stock: true },
    { id: "kc_mat_satin_pearl", name: "Satin Jedwabista Perła", hex: "#EDECE8", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.65, metalness: 0.05, in_stock: true },
    { id: "kc_mat_satin_black", name: "Satin Satynowa Czerń", hex: "#28292B", tier: "standard", type: "PLA", category: "single", price_per_cm3: 0.42, roughness: 0.65, metalness: 0.05, in_stock: true },
  ],
  SILK: [
    { id: "kc_silk_gold", name: "Silk Złoty", hex: "#D4AF37", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.40, roughness: 0.22, in_stock: true },
    { id: "kc_silk_silver", name: "Silk Srebrny", hex: "#A6A8A9", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.45, roughness: 0.22, in_stock: true },
    { id: "kc_silk_copper", name: "Silk Miedź", hex: "#B87333", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.40, roughness: 0.22, in_stock: true },
    { id: "kc_silk_blue", name: "Silk Błękitny", hex: "#33ACD4", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.25, roughness: 0.22, in_stock: true },
    { id: "kc_silk_red", name: "Silk Czerwony", hex: "#C83232", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.25, roughness: 0.22, in_stock: true },
    { id: "kc_silk_green", name: "Silk Szmaragdowy", hex: "#27AE60", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.25, roughness: 0.22, in_stock: true },
    { id: "kc_silk_purple", name: "Silk Fioletowy", hex: "#9B59B6", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.25, roughness: 0.22, in_stock: true },
    { id: "kc_silk_candy", name: "Silk Candy Róż", hex: "#ED8E93", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.25, roughness: 0.22, in_stock: true },
    { id: "kc_silk_black", name: "Silk Grafit / Czerń", hex: "#444444", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.35, roughness: 0.22, in_stock: true },
    { id: "kc_silk_white", name: "Silk Perłowy Biały", hex: "#F0F0EE", tier: "premium", type: "SILK", category: "single", price_per_cm3: 0.50, metalness: 0.20, roughness: 0.22, in_stock: true },
  ],
  WOOD: [
    { id: "kc_wood_birch", name: "Drewno Jasna Brzoza / Sosna", hex: "#D7BA89", tier: "premium", type: "WOOD", category: "single", price_per_cm3: 0.55, roughness: 0.94, metalness: 0.0, in_stock: true },
    { id: "kc_wood_oak", name: "Drewno Dąb Naturalny", hex: "#B48A5E", tier: "premium", type: "WOOD", category: "single", price_per_cm3: 0.55, roughness: 0.94, metalness: 0.0, in_stock: true },
    { id: "kc_wood_walnut", name: "Drewno Ciemny Orzech", hex: "#70482B", tier: "premium", type: "WOOD", category: "single", price_per_cm3: 0.55, roughness: 0.94, metalness: 0.0, in_stock: true },
    { id: "kc_wood_ebony", name: "Drewno Hebanowe", hex: "#3E2718", tier: "premium", type: "WOOD", category: "single", price_per_cm3: 0.55, roughness: 0.94, metalness: 0.0, in_stock: true },
  ],
  DUAL: [
    { id: "kc_dual_red_blue", name: "Dual Czerwony / Niebieski", hex: "#6F4FA6", colors: ["#C0292B", "#0984E3"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_black_gold", name: "Dual Czarny / Złoty", hex: "#7D6F3C", colors: ["#1E272C", "#D4AF37"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_red_gold", name: "Dual Czerwony / Złoty", hex: "#D56F34", colors: ["#D63031", "#D4AF37"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_pink_gold", name: "Dual Różowy / Złoty", hex: "#E89470", colors: ["#FD79A8", "#D4AF37"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_black_white", name: "Dual Czarny / Biały", hex: "#868D90", colors: ["#1E272C", "#DFE6E9"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_black_green", name: "Dual Czarny / Zieleń", hex: "#167666", colors: ["#1E272C", "#00B894"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_black_purple", name: "Dual Czarny / Fiolet", hex: "#4C488F", colors: ["#1E272C", "#6C5CE7"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_blue_green", name: "Dual Błękit / Zieleń", hex: "#059EBC", colors: ["#0984E3", "#00B894"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_dual_green_purple", name: "Dual Zieleń / Fiolet", hex: "#368A8E", colors: ["#00B894", "#6C5CE7"], tier: "premium", type: "MULTICOLOR", category: "dual", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
  ],
  TRI: [
    { id: "kc_tri_ryb", name: "Tri Czerwony / Żółty / Błękit", hex: "#B58080", colors: ["#D63031", "#FDCB6E", "#0984E3"], tier: "premium", type: "MULTICOLOR", category: "tri", price_per_cm3: 0.65, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_tri_bgp", name: "Tri Błękit / Zieleń / Fiolet", hex: "#2789C0", colors: ["#0984E3", "#00B894", "#6C5CE7"], tier: "premium", type: "MULTICOLOR", category: "tri", price_per_cm3: 0.65, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_tri_ryg", name: "Tri Czerwony / Żółty / Zieleń", hex: "#A7B33C", colors: ["#D63031", "#F1C40F", "#2ECC71"], tier: "premium", type: "MULTICOLOR", category: "tri", price_per_cm3: 0.65, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_tri_bgpur", name: "Tri Czarny / Złoty / Fiolet", hex: "#83796E", colors: ["#2C3E50", "#D4AF37", "#8E44AD"], tier: "premium", type: "MULTICOLOR", category: "tri", price_per_cm3: 0.65, roughness: 0.28, metalness: 0.15, in_stock: true },
  ],
  RAINBOW: [
    { id: "kc_rainbow_1", name: "Rainbow Classic (Tęcza)", hex: "#A29BFE", colors: ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], tier: "premium", type: "MULTICOLOR", category: "rainbow", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_rainbow_2", name: "Rainbow Pastel Candy", hex: "#FBC531", colors: ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], tier: "premium", type: "MULTICOLOR", category: "rainbow", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
    { id: "kc_rainbow_3", name: "Rainbow Jesień / Forest", hex: "#B9770E", colors: ["#D35400", "#F39C12", "#27AE60", "#2C3E50"], tier: "premium", type: "MULTICOLOR", category: "rainbow", price_per_cm3: 0.60, roughness: 0.28, metalness: 0.15, in_stock: true },
  ]
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
    SILK_PLA: KEYCHAIN_FILAMENTS.SILK,
    PETG: KEYCHAIN_FILAMENTS.PLA,
    DUAL_COLOR: KEYCHAIN_FILAMENTS.DUAL,
    TRI_COLOR: KEYCHAIN_FILAMENTS.TRI,
    RAINBOW: KEYCHAIN_FILAMENTS.RAINBOW,
  }
};


// -------------------------------------------------------------------------
// 2. PEŁNY KATALOG INŻYNIERYJNY DLA WYCENIARKI MODELI 3D (STL / CAD)
// -------------------------------------------------------------------------
export const STL_MATERIAL_GROUPS = [
  { id: "all", label: "Wszystkie" },
  { id: "standard", label: "Podstawowe & Wizualne", desc: "PLA Tough, Matte, Silk, PET-G" },
  { id: "tech", label: "Techniczne & Outdoor", desc: "PETG FR, ABS, ASA, PCTG, PA12 CF, TPU" },
];

export const STL_MATERIALS = [
  // 1. PLA TOUGH / STANDARD
  {
    id: "PLA_STANDARD",
    aliases: ["pla", "PLA", "PLA_STANDARD"],
    group: "standard",
    name: "PLA Tough / Standard",
    badge: "Najpopularniejszy",
    slicerType: "PLA",
    desc: "Najwyższa precyzja wymiarowa i gładkość detali. Idealny do prototypów, obudów i figurek.",
    pricePerCm3: 0.38,
    ratePerG: 0.27,
    density: 1.24,
    hdt: "55°C",
    tensileStrength: "Wysoka",
    uvResistance: "Średnia",
    colors: [
      { id: "c_black", name: "Głęboka Czerń", hex: "#1A1A1A" },
      { id: "c_white", name: "Czysta Biel", hex: "#F5F5F5" },
      { id: "c_grey", name: "Szary Standard", hex: "#63666A" },
      { id: "c_red", name: "Czerwień Ognista", hex: "#D32F2F" },
      { id: "c_blue", name: "Kobaltowy Błękit", hex: "#1976D2" },
      { id: "c_green", name: "Soczysta Zieleń", hex: "#388E3C" },
      { id: "c_yellow", name: "Czysty Żółty", hex: "#FBC02D" },
      { id: "c_orange", name: "Nasycony Pomarańcz", hex: "#F57C00" },
    ],
  },

  // 2. PLA MATTE / SATIN
  {
    id: "PLA_MATTE",
    aliases: ["pla_matte", "PLA_MATTE", "Matte"],
    group: "standard",
    name: "PLA Matte / Satin",
    badge: "Elegancki Mat",
    slicerType: "PLA Matte",
    desc: "Aksamitne, matowe wykończenie powierzchni doskonale maskujące warstwy druku.",
    pricePerCm3: 0.42,
    ratePerG: 0.28,
    density: 1.22,
    hdt: "55°C",
    tensileStrength: "Wysoka",
    uvResistance: "Średnia",
    colors: [
      { id: "cm_black", name: "Matte Czarny", hex: "#1E1E1E" },
      { id: "cm_white", name: "Matte Biały", hex: "#F0F3F4" },
      { id: "cm_grey", name: "Matte Szary", hex: "#718093" },
      { id: "cm_graphite", name: "Matte Grafit", hex: "#2F3542" },
      { id: "cm_red", name: "Matte Karmin", hex: "#FF4757" },
      { id: "cm_blue", name: "Matte Błękit", hex: "#1E90FF" },
    ],
  },

  // 3. PLA SILK
  {
    id: "PLA_SILK",
    aliases: ["pla_silk", "PLA_SILK", "Silk"],
    group: "standard",
    name: "PLA Silk / Jedwabisty",
    badge: "Metaliczny Połysk",
    slicerType: "PLA Silk",
    desc: "Błyszczące, jedwabiste wykończenie z metalicznym refleksem światła dla modeli ozdobnych.",
    pricePerCm3: 0.46,
    ratePerG: 0.29,
    density: 1.24,
    hdt: "55°C",
    tensileStrength: "Wysoka",
    uvResistance: "Średnia",
    colors: [
      { id: "cs_gold", name: "Silk Złoty", hex: "#D4AF37" },
      { id: "cs_silver", name: "Silk Srebrny", hex: "#A6A8A9" },
      { id: "cs_copper", name: "Silk Miedź", hex: "#B87333" },
      { id: "cs_blue", name: "Silk Błękitny", hex: "#33ACD4" },
      { id: "cs_red", name: "Silk Czerwony", hex: "#C83232" },
      { id: "cs_green", name: "Silk Szmaragdowy", hex: "#27AE60" },
    ],
  },

  // 4. PETG STANDARD
  {
    id: "PETG_TOUGH",
    aliases: ["petg", "PETG", "PETG_TOUGH"],
    group: "standard",
    name: "PETG Standard",
    badge: "Użytkowy",
    slicerType: "PETG",
    desc: "Trwały, wodoodporny materiał o podwyższonej odporności termicznej i chemicznej.",
    pricePerCm3: 0.44,
    ratePerG: 0.30,
    density: 1.27,
    hdt: "75°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Dobra",
    colors: [
      { id: "c_petg_black", name: "PETG Czarny", hex: "#1A1A1A" },
      { id: "c_petg_white", name: "PETG Biały", hex: "#F8F9FA" },
      { id: "c_petg_grey", name: "PETG Szary", hex: "#6C757D" },
      { id: "c_petg_clear", name: "PETG Transparent Clear", hex: "#E9ECEF" },
      { id: "c_petg_blue", name: "PETG Niebieski", hex: "#0D6EFD" },
      { id: "c_petg_red", name: "PETG Czerwony", hex: "#DC3545" },
    ],
  },

  // 5. PCTG WYSOKA UDARNOŚĆ
  {
    id: "PCTG_PRO",
    aliases: ["pctg", "PCTG", "PCTG_PRO"],
    group: "tech",
    name: "PCTG Wysoka Udarność",
    badge: "Ekstremalna Udarność",
    slicerType: "PCTG",
    desc: "Zaawansowany polimer o kilkukrotnie wyższej udarności niż PET-G. Wyjątkowo odporny na pękanie dynamiczne.",
    pricePerCm3: 0.60,
    ratePerG: 0.35,
    density: 1.23,
    hdt: "76°C",
    tensileStrength: "Ekstremalna",
    uvResistance: "Dobra",
    colors: [
      { id: "c_pctg_black", name: "PCTG Czarny", hex: "#17181A" },
      { id: "c_pctg_grey", name: "PCTG Szary", hex: "#64748B" },
      { id: "c_pctg_trans", name: "PCTG Transparentny/Mleczny", hex: "#E9ECEF" },
    ],
  },

  // 6. PETG FR SAMOGASNĄCY UL94 V-0
  {
    id: "PETG_FR",
    aliases: ["petg_fr", "PETG FR", "PETG_FR"],
    group: "tech",
    name: "PETG FR Samogasnący",
    badge: "Trudnopalny UL94 V-0",
    slicerType: "PETG FR",
    desc: "Certyfikowany materiał trudnopalny zgodny ze światową normą UL94 V-0 (gaśnie w <10s). Bezpieczny do elektroniki i szaf sterowniczych.",
    pricePerCm3: 0.85,
    ratePerG: 0.45,
    density: 1.29,
    hdt: "78°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Dobra",
    colors: [
      { id: "c_petgfr_black", name: "PETG FR Czarny", hex: "#111111" },
      { id: "c_petgfr_white", name: "PETG FR Biały", hex: "#F8FAFC" },
    ],
  },

  // 7. ABS PRZEMYSŁOWY
  {
    id: "ABS_INDUSTRY",
    aliases: ["abs", "ABS", "ABS_INDUSTRY"],
    group: "tech",
    name: "ABS Przemysłowy",
    badge: "Odporny termicznie",
    slicerType: "ABS",
    desc: "Przemysłowy standard o wysokiej sztywności i twardości. Odporny na uderzenia i podwyższone temperatury.",
    pricePerCm3: 0.52,
    ratePerG: 0.26,
    density: 1.05,
    hdt: "90°C",
    tensileStrength: "Wysoka udarność",
    uvResistance: "Średnia",
    colors: [
      { id: "c_abs_black", name: "ABS Czarny", hex: "#1a1a1a" },
      { id: "c_abs_white", name: "ABS Biały", hex: "#FFFFFF" },
      { id: "c_abs_grey", name: "ABS Szary", hex: "#64748B" },
    ],
  },

  // 8. ASA ODPORNY UV & OUTDOOR
  {
    id: "ASA_UV",
    aliases: ["asa", "ASA", "ASA_UV"],
    group: "tech",
    name: "ASA Odporny UV & Outdoor",
    badge: "Odporny UV & Outdoor",
    slicerType: "ASA",
    desc: "Polimer stworzony do ekspozycji na zewnątrz i do automotive. Wyjątkowo odporny na promieniowanie słoneczne UV, deszcz i mróz.",
    pricePerCm3: 0.65,
    ratePerG: 0.35,
    density: 1.07,
    hdt: "95°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Maksymalna (Outdoor)",
    colors: [
      { id: "c_asa_black", name: "ASA Czarny Mat", hex: "#1B1B1C" },
      { id: "c_asa_white", name: "ASA Czysty Biały", hex: "#F8F9FA" },
      { id: "c_asa_grey", name: "ASA Szary Techniczny", hex: "#6C757D" },
      { id: "c_asa_klein", name: "ASA Klein Blue", hex: "#1729AB" },
    ],
  },

  // 9. PA12 CF (NYLON Z WŁÓKNEM WĘGLOWYM)
  {
    id: "PA12_CF15",
    aliases: ["pa12_cf", "PA12 CF", "PA12_CF15", "PA-CF"],
    group: "tech",
    name: "PA12 CF Włókno Węglowe",
    badge: "Kompozyt Carbon",
    slicerType: "PA12 CF",
    desc: "Strukturalny kompozyt nylonu wzmocniony w 15% ciętym włóknem węglowym. Zastępuje aluminium w robotyce i częściach maszyn.",
    pricePerCm3: 1.25,
    ratePerG: 0.75,
    density: 1.15,
    hdt: "155°C",
    tensileStrength: "Ekstremalna sztywność",
    uvResistance: "Bardzo dobra",
    colors: [
      { id: "c_pa12cf_black", name: "Głęboki matowy antracyt / karbon", hex: "#1c1d21" },
    ],
  },

  // 10. TPU 95A / GUMA
  {
    id: "TPU_FLEX",
    aliases: ["tpu", "tpu_95a", "TPU 95A", "TPU_FLEX", "FLEX"],
    group: "tech",
    name: "TPU 95A / Guma",
    badge: "Elastyczna Guma 95A",
    slicerType: "TPU",
    desc: "Elastyczny elastomer poliuretanowy o twardości 95A Shore'a. Znakomicie tłumi drgania, powraca do pierwotnego kształtu.",
    pricePerCm3: 0.70,
    ratePerG: 0.45,
    density: 1.21,
    hdt: "60°C",
    tensileStrength: "Sprężysta guma",
    uvResistance: "Bardzo dobra",
    colors: [
      { id: "c_tpu_black", name: "Flex TPU Czarny", hex: "#212529" },
      { id: "c_tpu_white", name: "Flex TPU Biały", hex: "#F8F9FA" },
      { id: "c_tpu_red", name: "Flex TPU Czerwony", hex: "#DC3545" },
      { id: "c_tpu_blue", name: "Flex TPU Błękitny", hex: "#0D6EFD" },
    ],
  },
];

// Backwards compatibility aliases
export const FILAMENT_DATABASE = ALL_KEYCHAIN_COLORS;
export const TIERS = [
  { id: "all", label: "Wszystkie" },
  { id: "standard", label: "PLA Standard" },
  { id: "premium", label: "Silk / Wood / Dual" }
];
export const MATERIAL_TYPES = KEYCHAIN_CATEGORIES;