export const TIERS = [
  { id: "standard", label: "Standard / Ekonomiczny", desc: "Podstawowe kolory, Silk, Dual/Tri oraz Rainbow" },
  { id: "premium", label: "Klasa Premium / Inżynieryjna", desc: "Matte, PCTG, Carbon Fiber, Nylon i Flex Przemysłowy" },
];

export const MATERIAL_TYPES = [
  { id: "PLA", label: "PLA Standard / Matte", density: 1.24, pricePerCm3: 0.38 },
  { id: "SILK", label: "Silk (Wysoki Połysk)", density: 1.25, pricePerCm3: 0.48 },
  { id: "PETG", label: "PET-G / PCTG (Użytkowy)", density: 1.27, pricePerCm3: 0.42 },
  { id: "FLEX", label: "Guma / Flex (Elastyczny)", density: 1.21, pricePerCm3: 0.65 },
  { id: "TECH", label: "Materiały Techniczne (PP/ASA/ABS/HT)", density: 1.15, pricePerCm3: 0.60 },
  { id: "COMPOSITE", label: "Carbon Fiber (Włókno Węglowe)", density: 1.30, pricePerCm3: 0.95 },
  { id: "MULTICOLOR", label: "Dual / Tri / Rainbow", density: 1.25, pricePerCm3: 0.58 },
];

export const FILAMENT_DATABASE = [
  // STANDARD - PLA
  { id: "std_pla_white", tier: "standard", type: "PLA", name: "Czysta Biel (White)", hex: "#E6E6E2", category: "single" },
  { id: "std_pla_bone_white", tier: "standard", type: "PLA", name: "Kość Słoniowa (Bone White)", hex: "#ECE4D8", category: "single" },
  { id: "std_pla_cyan", tier: "standard", type: "PLA", name: "Cyjan (Cyan)", hex: "#00B4D8", category: "single" },
  { id: "std_pla_black", tier: "standard", type: "PLA", name: "Głęboka Czerń (Black)", hex: "#222222", category: "single" },
  { id: "std_pla_light_grey", tier: "standard", type: "PLA", name: "Jasnoszary (Light Grey)", hex: "#6B6E6E", category: "single" },
  { id: "std_pla_grey", tier: "standard", type: "PLA", name: "Szary Neutralny (Grey)", hex: "#484A4C", category: "single" },
  { id: "std_pla_dark_gray", tier: "standard", type: "PLA", name: "Ciemnoszary (Dark Gray)", hex: "#474A4D", category: "single" },
  { id: "std_pla_red", tier: "standard", type: "PLA", name: "Czerwień Ognista (Red)", hex: "#B34044", category: "single" },
  { id: "std_pla_dark_red", tier: "standard", type: "PLA", name: "Ciemnoczerwony (Bordo)", hex: "#8A171A", category: "single" },
  { id: "std_pla_blue", tier: "standard", type: "PLA", name: "Kobaltowy Błękit (Blue)", hex: "#0063A0", category: "single" },
  { id: "std_pla_sky_blue", tier: "standard", type: "PLA", name: "Błękit Nieba (Sky Blue)", hex: "#0CB7CC", category: "single" },
  { id: "std_pla_navy_blue", tier: "standard", type: "PLA", name: "Granatowy (Navy Blue)", hex: "#133E7C", category: "single" },
  { id: "std_pla_light_blue", tier: "standard", type: "PLA", name: "Błękitny Pastel (Light Blue)", hex: "#5DADE2", category: "single" },
  { id: "std_pla_light_green", tier: "standard", type: "PLA", name: "Jasna Zieleń (Light Green)", hex: "#4EE349", category: "single" },
  { id: "std_pla_dark_green", tier: "standard", type: "PLA", name: "Ciemna Zieleń (Dark Green)", hex: "#145A32", category: "single" },
  { id: "std_pla_yellow", tier: "standard", type: "PLA", name: "Czysty Żółty (Yellow)", hex: "#FFBD2C", category: "single" },
  { id: "std_pla_vivid_yellow", tier: "standard", type: "PLA", name: "Nasycony Żółty (Vivid Yellow)", hex: "#F39C12", category: "single" },
  { id: "std_pla_orange", tier: "standard", type: "PLA", name: "Pomarańczowy (Orange)", hex: "#E65C00", category: "single" },
  { id: "std_pla_sunny_orange", tier: "standard", type: "PLA", name: "Słoneczny Pomarańcz", hex: "#FF7B00", category: "single" },
  { id: "std_pla_purple", tier: "standard", type: "PLA", name: "Fioletowy (Purple)", hex: "#8887C5", category: "single" },
  { id: "std_pla_pink", tier: "standard", type: "PLA", name: "Różowy (Pink)", hex: "#E881A6", category: "single" },
  { id: "std_pla_beige", tier: "standard", type: "PLA", name: "Cielisty / Beż (Skin)", hex: "#F7BEA1", category: "single" },
  { id: "std_pla_brown", tier: "standard", type: "PLA", name: "Ciepły Brąz (Brown)", hex: "#8E6B4E", category: "single" },
  { id: "std_pla_silver", tier: "standard", type: "PLA", name: "Srebrny (Silver)", hex: "#8A8D8F", category: "single" },
  { id: "std_pla_gold", tier: "standard", type: "PLA", name: "Złoty (Light Gold)", hex: "#D4AF37", category: "single" },
  { id: "std_pla_copper", tier: "standard", type: "PLA", name: "Miedź (Copper)", hex: "#A0522D", category: "single" },
  { id: "std_pla_trans", tier: "standard", type: "PLA", name: "Transparentny (Clear)", hex: "#EDEDED", category: "single" },

  // STANDARD - SILK
  { id: "std_silk_gold", tier: "standard", type: "SILK", name: "Silk Złoty (Gold)", hex: "#D4AF37", category: "single", metalness: 0.4, roughness: 0.25 },
  { id: "std_silk_silver", tier: "standard", type: "SILK", name: "Silk Srebrny (Silver)", hex: "#A6A8A9", category: "single", metalness: 0.4, roughness: 0.25 },
  { id: "std_silk_copper", tier: "standard", type: "SILK", name: "Silk Miedź (Copper)", hex: "#B87333", category: "single", metalness: 0.4, roughness: 0.25 },
  { id: "std_silk_blue", tier: "standard", type: "SILK", name: "Silk Błękitny (Blue)", hex: "#33ACD4", category: "single", metalness: 0.25, roughness: 0.25 },
  { id: "std_silk_red", tier: "standard", type: "SILK", name: "Silk Czerwony (Red)", hex: "#C83232", category: "single", metalness: 0.25, roughness: 0.25 },
  { id: "std_silk_green", tier: "standard", type: "SILK", name: "Silk Zielony (Green)", hex: "#27AE60", category: "single", metalness: 0.25, roughness: 0.25 },
  { id: "std_silk_purple", tier: "standard", type: "SILK", name: "Silk Fioletowy (Purple)", hex: "#9B59B6", category: "single", metalness: 0.25, roughness: 0.25 },
  { id: "std_silk_candy", tier: "standard", type: "SILK", name: "Silk Candy Róż", hex: "#ED8E93", category: "single", metalness: 0.25, roughness: 0.25 },
  { id: "std_silk_black", tier: "standard", type: "SILK", name: "Silk Grafit / Czerń", hex: "#444444", category: "single", metalness: 0.35, roughness: 0.25 },
  { id: "std_silk_white", tier: "standard", type: "SILK", name: "Silk Perłowy Biały", hex: "#F0F0EE", category: "single", metalness: 0.2, roughness: 0.25 },

  // STANDARD - MULTICOLOR
  { id: "std_dual_red_blue", tier: "standard", type: "MULTICOLOR", name: "Dual Czerwony / Niebieski", hex: "#6F4FA6", colors: ["#C0292B", "#0984E3"], category: "dual" },
  { id: "std_dual_black_gold", tier: "standard", type: "MULTICOLOR", name: "Dual Czarny / Złoty", hex: "#7D6F3C", colors: ["#1E272C", "#D4AF37"], category: "dual" },
  { id: "std_dual_red_gold", tier: "standard", type: "MULTICOLOR", name: "Dual Czerwony / Złoty", hex: "#D56F34", colors: ["#D63031", "#D4AF37"], category: "dual" },
  { id: "std_dual_pink_gold", tier: "standard", type: "MULTICOLOR", name: "Dual Różowy / Złoty", hex: "#E89470", colors: ["#FD79A8", "#D4AF37"], category: "dual" },
  { id: "std_dual_black_white", tier: "standard", type: "MULTICOLOR", name: "Dual Czarny / Biały", hex: "#868D90", colors: ["#1E272C", "#DFE6E9"], category: "dual" },
  { id: "std_dual_black_green", tier: "standard", type: "MULTICOLOR", name: "Dual Czarny / Zieleń", hex: "#167666", colors: ["#1E272C", "#00B894"], category: "dual" },
  { id: "std_dual_black_purple", tier: "standard", type: "MULTICOLOR", name: "Dual Czarny / Fiolet", hex: "#4C488F", colors: ["#1E272C", "#6C5CE7"], category: "dual" },
  { id: "std_dual_blue_green", tier: "standard", type: "MULTICOLOR", name: "Dual Błękit / Zieleń", hex: "#059EBC", colors: ["#0984E3", "#00B894"], category: "dual" },
  { id: "std_dual_green_purple", tier: "standard", type: "MULTICOLOR", name: "Dual Zieleń / Fiolet", hex: "#368A8E", colors: ["#00B894", "#6C5CE7"], category: "dual" },

  { id: "std_tri_ryb", tier: "standard", type: "MULTICOLOR", name: "Tri Czerwony / Żółty / Błękit", hex: "#B58080", colors: ["#D63031", "#FDCB6E", "#0984E3"], category: "tri" },
  { id: "std_tri_bgp", tier: "standard", type: "MULTICOLOR", name: "Tri Błękit / Zieleń / Fiolet", hex: "#2789C0", colors: ["#0984E3", "#00B894", "#6C5CE7"], category: "tri" },
  { id: "std_tri_ryg", tier: "standard", type: "MULTICOLOR", name: "Tri Czerwony / Żółty / Zieleń", hex: "#A7B33C", colors: ["#D63031", "#F1C40F", "#2ECC71"], category: "tri" },
  { id: "std_tri_bgpur", tier: "standard", type: "MULTICOLOR", name: "Tri Czarny / Złoty / Fiolet", hex: "#83796E", colors: ["#2C3E50", "#D4AF37", "#8E44AD"], category: "tri" },

  { id: "std_rainbow_1", tier: "standard", type: "MULTICOLOR", name: "Rainbow Classic (Tęcza)", hex: "#A29BFE", colors: ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], category: "rainbow" },
  { id: "std_rainbow_2", tier: "standard", type: "MULTICOLOR", name: "Rainbow Pastel (Candy)", hex: "#FBC531", colors: ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], category: "rainbow" },
  { id: "std_rainbow_3", tier: "standard", type: "MULTICOLOR", name: "Rainbow Jesień (Forest)", hex: "#B9770E", colors: ["#D35400", "#F39C12", "#27AE60", "#2C3E50"], category: "rainbow" },

  // STANDARD - PETG
  { id: "std_petg_white", tier: "standard", type: "PETG", name: "PET-G Biały", hex: "#EDEDEA", category: "single" },
  { id: "std_petg_black", tier: "standard", type: "PETG", name: "PET-G Czarny", hex: "#18191A", category: "single" },
  { id: "std_petg_grey", tier: "standard", type: "PETG", name: "PET-G Szary", hex: "#63676B", category: "single" },
  { id: "std_petg_red", tier: "standard", type: "PETG", name: "PET-G Czerwony", hex: "#BA1C1F", category: "single" },
  { id: "std_petg_blue", tier: "standard", type: "PETG", name: "PET-G Niebieski", hex: "#1E88E5", category: "single" },
  { id: "std_petg_yellow", tier: "standard", type: "PETG", name: "PET-G Żółty", hex: "#FBC02D", category: "single" },
  { id: "std_petg_orange", tier: "standard", type: "PETG", name: "PET-G Pomarańczowy", hex: "#F57C00", category: "single" },
  { id: "std_petg_green", tier: "standard", type: "PETG", name: "PET-G Zielony", hex: "#43A047", category: "single" },
  { id: "std_petg_clear", tier: "standard", type: "PETG", name: "PET-G Transparent Clear", hex: "#F5F5F5", category: "single" },
  { id: "std_petg_trans_blue", tier: "standard", type: "PETG", name: "PET-G Transparent Błękit", hex: "#3A8EDB", category: "single" },
  { id: "std_petg_trans_red", tier: "standard", type: "PETG", name: "PET-G Transparent Czerwień", hex: "#E53935", category: "single" },

  // STANDARD - FLEX & TECH
  { id: "std_tpu_black", tier: "standard", type: "FLEX", name: "Flex TPU Czarny", hex: "#222324", category: "single" },
  { id: "std_tpu_white", tier: "standard", type: "FLEX", name: "Flex TPU Biały", hex: "#E3E4E1", category: "single" },
  { id: "std_tpu_red", tier: "standard", type: "FLEX", name: "Flex TPU Czerwony", hex: "#C62828", category: "single" },
  { id: "std_tpu_blue", tier: "standard", type: "FLEX", name: "Flex TPU Niebieski", hex: "#1565C0", category: "single" },
  { id: "std_tpu_yellow", tier: "standard", type: "FLEX", name: "Flex TPU Żółty", hex: "#FDD835", category: "single" },

  { id: "std_abs_black", tier: "standard", type: "TECH", name: "ABS Konstrukcyjny Czarny", hex: "#232425", category: "single" },
  { id: "std_abs_white", tier: "standard", type: "TECH", name: "ABS Konstrukcyjny Biały", hex: "#ECEEEB", category: "single" },
  { id: "std_abs_grey", tier: "standard", type: "TECH", name: "ABS Konstrukcyjny Szary", hex: "#6D7073", category: "single" },
  { id: "std_asa_black", tier: "standard", type: "TECH", name: "ASA UV Czarny", hex: "#1B1B1C", category: "single" },
  { id: "std_asa_white", tier: "standard", type: "TECH", name: "ASA UV Biały", hex: "#F3F4F1", category: "single" },
  { id: "std_asa_klein_blue", tier: "standard", type: "TECH", name: "ASA UV Klein Blue", hex: "#1729AB", category: "single" },

  // =========================================================================
  // PREMIUM / KLASA INŻYNIERYJNA
  // =========================================================================
  // PREMIUM - MATTE PLA
  { id: "prm_mat_white", tier: "premium", type: "PLA", name: "Matte Czysta Biel", hex: "#F1F2F6", category: "single", roughness: 0.88 },
  { id: "prm_mat_black", tier: "premium", type: "PLA", name: "Matte Głęboka Czerń", hex: "#1E1E1E", category: "single", roughness: 0.88 },
  { id: "prm_mat_gray", tier: "premium", type: "PLA", name: "Matte Szary Neutralny", hex: "#747D8C", category: "single", roughness: 0.88 },
  { id: "prm_mat_graphite", tier: "premium", type: "PLA", name: "Matte Grafit Ciemny", hex: "#2F3542", category: "single", roughness: 0.88 },
  { id: "prm_mat_red", tier: "premium", type: "PLA", name: "Matte Karminowa Czerwień", hex: "#FF4757", category: "single", roughness: 0.88 },
  { id: "prm_mat_blue", tier: "premium", type: "PLA", name: "Matte Błękit Kobalt", hex: "#1E90FF", category: "single", roughness: 0.88 },
  { id: "prm_mat_green", tier: "premium", type: "PLA", name: "Matte Soczysta Zieleń", hex: "#2ED573", category: "single", roughness: 0.88 },
  { id: "prm_mat_yellow", tier: "premium", type: "PLA", name: "Matte Żółty Ciepły", hex: "#FFA502", category: "single", roughness: 0.88 },

  // PREMIUM - PCTG & SATIN
  { id: "prm_pctg_trans", tier: "premium", type: "PETG", name: "PCTG Ultra-Wytrzymały Krystaliczny", hex: "#F2F4F3", category: "single" },
  { id: "prm_pctg_black", tier: "premium", type: "PETG", name: "PCTG Ultra-Wytrzymały Czarny", hex: "#17181A", category: "single" },
  { id: "prm_pctg_grey", tier: "premium", type: "PETG", name: "PCTG Ultra-Wytrzymały Szary", hex: "#6E7175", category: "single" },
  { id: "prm_pctg_orange", tier: "premium", type: "PETG", name: "PCTG Transparent Pomarańcz", hex: "#E65100", category: "single" },
  { id: "prm_pctg_blue", tier: "premium", type: "PETG", name: "PCTG Transparent Błękit", hex: "#0288D1", category: "single" },
  { id: "prm_satin_black", tier: "premium", type: "PLA", name: "Satin Jedwabisty Mat Czerń", hex: "#28292B", category: "single", roughness: 0.6 },
  { id: "prm_satin_pearl", tier: "premium", type: "PLA", name: "Satin Jedwabisty Mat Perła", hex: "#EDECE8", category: "single", roughness: 0.6 },

  // PREMIUM - FLEX PRZEMYSŁOWY
  { id: "prm_flex_black", tier: "premium", type: "FLEX", name: "Flex Premium Czarny Mat", hex: "#1E1E1E", category: "single" },
  { id: "prm_flex_white", tier: "premium", type: "FLEX", name: "Flex Premium Biały Czysty", hex: "#F5F6FA", category: "single" },
  { id: "prm_flex_gray", tier: "premium", type: "FLEX", name: "Flex Premium Szary Techniczny", hex: "#718093", category: "single" },
  { id: "prm_flex_red", tier: "premium", type: "FLEX", name: "Flex Premium Czerwień", hex: "#E84118", category: "single" },
  { id: "prm_flex_blue", tier: "premium", type: "FLEX", name: "Flex Premium Błękit", hex: "#0097E6", category: "single" },
  { id: "prm_flex_yellow", tier: "premium", type: "FLEX", name: "Flex Premium Żółty", hex: "#FBC531", category: "single" },
  { id: "prm_flex_orange", tier: "premium", type: "FLEX", name: "Flex Premium Pomarańcz", hex: "#E67E22", category: "single" },

  // PREMIUM - COMPOSITES & INŻYNIERYJNE
  { id: "prm_pa12_cf15", tier: "premium", type: "COMPOSITE", name: "Nylon PA12 + CF15 (Włókno Węglowe)", hex: "#2C2D30", category: "single", roughness: 0.9, metalness: 0.1 },
  { id: "prm_pctg_cf10", tier: "premium", type: "COMPOSITE", name: "PCTG + CF10 Carbon", hex: "#262729", category: "single", roughness: 0.88, metalness: 0.1 },

  { id: "prm_pp_natural", tier: "premium", type: "TECH", name: "PP Polipropylen Chemioodporny Mleczny", hex: "#EFEFE8", category: "single" },
  { id: "prm_pp_black", tier: "premium", type: "TECH", name: "PP Polipropylen Czarny", hex: "#202124", category: "single" },
  { id: "prm_pa12_natural", tier: "premium", type: "TECH", name: "Nylon PA12 Naturalny", hex: "#E5E6DF", category: "single" },
  { id: "prm_pa12_black", tier: "premium", type: "TECH", name: "Nylon PA12 Czarny", hex: "#1C1D1E", category: "single" },
  { id: "prm_cpe_ht", tier: "premium", type: "TECH", name: "CPE HT Wysokotemperaturowy (110°C)", hex: "#F7F8F5", category: "single" }
];

// Helper zachowujący kompatybilność z Three.js breloków
export const SUNLU_CATALOG = {
  categories: MATERIAL_TYPES,
  colors: {
    PLA_PLUS: FILAMENT_DATABASE.filter((f) => f.type === "PLA"),
    SILK_PLA: FILAMENT_DATABASE.filter((f) => f.type === "SILK"),
    PETG: FILAMENT_DATABASE.filter((f) => f.type === "PETG"),
    DUAL_COLOR: FILAMENT_DATABASE.filter((f) => f.category === "dual"),
    TRI_COLOR: FILAMENT_DATABASE.filter((f) => f.category === "tri"),
    RAINBOW: FILAMENT_DATABASE.filter((f) => f.category === "rainbow"),
  }
};