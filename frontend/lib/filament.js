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
  { id: "PLA", label: "PLA Standard", badge: "Gładki" },
  { id: "MATTE", label: "Matte", badge: "Aksamit" },
  { id: "SILK", label: "Silk Błysk", badge: "Jedwabny" },
  { id: "WOOD", label: "Wood Drewno", badge: "Naturalny" },
  { id: "DUAL", label: "Dual-Color", badge: "Dwukolorowy" },
  { id: "TRI", label: "Tri-Color", badge: "Trzykolorowy" },
  { id: "RAINBOW", label: "Rainbow", badge: "Tęcza" },
];

export const KEYCHAIN_FILAMENTS = {
  PLA: [
    { id: "kc_pla_white", name: "Czysta Biel", hex: "#E6E6E2", type: "single", roughness: 0.4 },
    { id: "kc_pla_bone", name: "Kość Słoniowa", hex: "#ECE4D8", type: "single", roughness: 0.4 },
    { id: "kc_pla_black", name: "Głęboka Czerń", hex: "#222222", type: "single", roughness: 0.4 },
    { id: "kc_pla_grey", name: "Szary Standard", hex: "#6B6E6E", type: "single", roughness: 0.4 },
    { id: "kc_pla_dark_gray", name: "Ciemnoszary", hex: "#474A4D", type: "single", roughness: 0.4 },
    { id: "kc_pla_red", name: "Ognista Czerwień", hex: "#B34044", type: "single", roughness: 0.4 },
    { id: "kc_pla_dark_red", name: "Bordo / Ciemnoczerwony", hex: "#8A171A", type: "single", roughness: 0.4 },
    { id: "kc_pla_blue", name: "Kobaltowy Błękit", hex: "#0063A0", type: "single", roughness: 0.4 },
    { id: "kc_pla_sky", name: "Błękit Nieba", hex: "#0CB7CC", type: "single", roughness: 0.4 },
    { id: "kc_pla_navy", name: "Granatowy", hex: "#133E7C", type: "single", roughness: 0.4 },
    { id: "kc_pla_green", name: "Żywa Zieleń", hex: "#4EE349", type: "single", roughness: 0.4 },
    { id: "kc_pla_dark_green", name: "Ciemna Zieleń", hex: "#145A32", type: "single", roughness: 0.4 },
    { id: "kc_pla_yellow", name: "Czysty Żółty", hex: "#FFBD2C", type: "single", roughness: 0.4 },
    { id: "kc_pla_orange", name: "Pomarańczowy", hex: "#E65C00", type: "single", roughness: 0.4 },
    { id: "kc_pla_purple", name: "Fiolet", hex: "#8887C5", type: "single", roughness: 0.4 },
    { id: "kc_pla_pink", name: "Różowy", hex: "#E881A6", type: "single", roughness: 0.4 },
    { id: "kc_pla_skin", name: "Cielisty Beż", hex: "#F7BEA1", type: "single", roughness: 0.4 },
    { id: "kc_pla_brown", name: "Ciepły Brąz", hex: "#8E6B4E", type: "single", roughness: 0.4 },
    { id: "kc_pla_silver", name: "Srebrny", hex: "#8A8D8F", type: "single", roughness: 0.4 },
    { id: "kc_pla_gold", name: "Złoty Standard", hex: "#D4AF37", type: "single", roughness: 0.4 },
    { id: "kc_pla_copper", name: "Miedź Standard", hex: "#A0522D", type: "single", roughness: 0.4 },
  ],
  MATTE: [
    { id: "kc_mat_white", name: "Matte Czysta Biel", hex: "#F1F2F6", type: "single", roughness: 0.90 },
    { id: "kc_mat_black", name: "Matte Głęboka Czerń", hex: "#1E1E1E", type: "single", roughness: 0.90 },
    { id: "kc_mat_gray", name: "Matte Szary Neutralny", hex: "#747D8C", type: "single", roughness: 0.90 },
    { id: "kc_mat_graphite", name: "Matte Grafit Ciemny", hex: "#2F3542", type: "single", roughness: 0.90 },
    { id: "kc_mat_red", name: "Matte Karminowa Czerwień", hex: "#FF4757", type: "single", roughness: 0.90 },
    { id: "kc_mat_blue", name: "Matte Błękit Kobalt", hex: "#1E90FF", type: "single", roughness: 0.90 },
    { id: "kc_mat_green", name: "Matte Soczysta Zieleń", hex: "#2ED573", type: "single", roughness: 0.90 },
    { id: "kc_mat_yellow", name: "Matte Ciepły Żółty", hex: "#FFA502", type: "single", roughness: 0.90 },
    { id: "kc_mat_satin_pearl", name: "Satin Jedwabista Perła", hex: "#EDECE8", type: "single", roughness: 0.65 },
    { id: "kc_mat_satin_black", name: "Satin Satynowa Czerń", hex: "#28292B", type: "single", roughness: 0.65 },
  ],
  SILK: [
    { id: "kc_silk_gold", name: "Silk Złoty", hex: "#D4AF37", type: "single", metalness: 0.40, roughness: 0.22 },
    { id: "kc_silk_silver", name: "Silk Srebrny", hex: "#A6A8A9", type: "single", metalness: 0.45, roughness: 0.22 },
    { id: "kc_silk_copper", name: "Silk Miedź", hex: "#B87333", type: "single", metalness: 0.40, roughness: 0.22 },
    { id: "kc_silk_blue", name: "Silk Błękitny", hex: "#33ACD4", type: "single", metalness: 0.25, roughness: 0.22 },
    { id: "kc_silk_red", name: "Silk Czerwony", hex: "#C83232", type: "single", metalness: 0.25, roughness: 0.22 },
    { id: "kc_silk_green", name: "Silk Szmaragdowy", hex: "#27AE60", type: "single", metalness: 0.25, roughness: 0.22 },
    { id: "kc_silk_purple", name: "Silk Fioletowy", hex: "#9B59B6", type: "single", metalness: 0.25, roughness: 0.22 },
    { id: "kc_silk_candy", name: "Silk Candy Róż", hex: "#ED8E93", type: "single", metalness: 0.25, roughness: 0.22 },
    { id: "kc_silk_black", name: "Silk Grafit / Czerń", hex: "#444444", type: "single", metalness: 0.35, roughness: 0.22 },
    { id: "kc_silk_white", name: "Silk Perłowy Biały", hex: "#F0F0EE", type: "single", metalness: 0.20, roughness: 0.22 },
  ],
  WOOD: [
    { id: "kc_wood_birch", name: "Drewno Jasna Brzoza / Sosna", hex: "#D7BA89", type: "single", roughness: 0.94, metalness: 0.0 },
    { id: "kc_wood_oak", name: "Drewno Dąb Naturalny", hex: "#B48A5E", type: "single", roughness: 0.94, metalness: 0.0 },
    { id: "kc_wood_walnut", name: "Drewno Ciemny Orzech", hex: "#70482B", type: "single", roughness: 0.94, metalness: 0.0 },
    { id: "kc_wood_ebony", name: "Drewno Hebanowe", hex: "#3E2718", type: "single", roughness: 0.94, metalness: 0.0 },
  ],
  DUAL: [
    { id: "kc_dual_red_blue", name: "Dual Czerwony / Niebieski", hex: "#6F4FA6", colors: ["#C0292B", "#0984E3"], type: "dual" },
    { id: "kc_dual_black_gold", name: "Dual Czarny / Złoty", hex: "#7D6F3C", colors: ["#1E272C", "#D4AF37"], type: "dual" },
    { id: "kc_dual_red_gold", name: "Dual Czerwony / Złoty", hex: "#D56F34", colors: ["#D63031", "#D4AF37"], type: "dual" },
    { id: "kc_dual_pink_gold", name: "Dual Różowy / Złoty", hex: "#E89470", colors: ["#FD79A8", "#D4AF37"], type: "dual" },
    { id: "kc_dual_black_white", name: "Dual Czarny / Biały", hex: "#868D90", colors: ["#1E272C", "#DFE6E9"], type: "dual" },
    { id: "kc_dual_black_green", name: "Dual Czarny / Zieleń", hex: "#167666", colors: ["#1E272C", "#00B894"], type: "dual" },
    { id: "kc_dual_black_purple", name: "Dual Czarny / Fiolet", hex: "#4C488F", colors: ["#1E272C", "#6C5CE7"], type: "dual" },
    { id: "kc_dual_blue_green", name: "Dual Błękit / Zieleń", hex: "#059EBC", colors: ["#0984E3", "#00B894"], type: "dual" },
    { id: "kc_dual_green_purple", name: "Dual Zieleń / Fiolet", hex: "#368A8E", colors: ["#00B894", "#6C5CE7"], type: "dual" },
  ],
  TRI: [
    { id: "kc_tri_ryb", name: "Tri Czerwony / Żółty / Błękit", hex: "#B58080", colors: ["#D63031", "#FDCB6E", "#0984E3"], type: "tri" },
    { id: "kc_tri_bgp", name: "Tri Błękit / Zieleń / Fiolet", hex: "#2789C0", colors: ["#0984E3", "#00B894", "#6C5CE7"], type: "tri" },
    { id: "kc_tri_ryg", name: "Tri Czerwony / Żółty / Zieleń", hex: "#A7B33C", colors: ["#D63031", "#F1C40F", "#2ECC71"], type: "tri" },
    { id: "kc_tri_bgpur", name: "Tri Czarny / Złoty / Fiolet", hex: "#83796E", colors: ["#2C3E50", "#D4AF37", "#8E44AD"], type: "tri" },
  ],
  RAINBOW: [
    { id: "kc_rainbow_1", name: "Rainbow Classic (Tęcza)", hex: "#A29BFE", colors: ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], type: "rainbow" },
    { id: "kc_rainbow_2", name: "Rainbow Pastel Candy", hex: "#FBC531", colors: ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], type: "rainbow" },
    { id: "kc_rainbow_3", name: "Rainbow Jesień / Forest", hex: "#B9770E", colors: ["#D35400", "#F39C12", "#27AE60", "#2C3E50"], type: "rainbow" },
  ]
};

// Spłaszczona lista kolorów brelokowych (używana m.in. do autodetekcji kolorów AI)
export const ALL_KEYCHAIN_COLORS = Object.values(KEYCHAIN_FILAMENTS).flat();

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
  { id: "all", label: "Wszystkie materiały" },
  { id: "standard", label: "Podstawowe & Wizualne", desc: "PLA, PET-G, Silk – estetyka, niska cena" },
  { id: "tech", label: "Techniczne & Outdoor", desc: "ASA, ABS, PCTG, PP – odporność UV, temp. do 110°C" },
  { id: "flex", label: "Elastyczne (Guma)", desc: "TPU 95A / Flex – uszczelki, odbojniki, amortyzacja" },
  { id: "composite", label: "Kompozyty Carbon", desc: "PA12-CF15, PCTG-CF10 – wzmocnione włóknem węglowym" },
];

export const STL_MATERIALS = [
  // STANDARD
  {
    id: "PLA_STANDARD",
    group: "standard",
    name: "PLA Tough / Standard",
    badge: "Najpopularniejszy",
    desc: "Najwyższa precyzja wymiarowa i gładkość detali. Idealny do prototypów, obudów i figurek.",
    pricePerCm3: 0.38,
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
    ]
  },
  {
    id: "PLA_MATTE",
    group: "standard",
    name: "PLA Matte / Satin",
    badge: "Elegancki Mat",
    desc: "Aksamitne, matowe wykończenie powierzchni doskonale maskujące warstwy druku.",
    pricePerCm3: 0.42,
    density: 1.24,
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
    ]
  },
  {
    id: "PETG_TOUGH",
    group: "standard",
    name: "PET-G Odporny",
    badge: "Użytkowy",
    desc: "Trwały, wodoodporny materiał o podwyższonej odporności termicznej i chemicznej.",
    pricePerCm3: 0.44,
    density: 1.27,
    hdt: "75°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Dobra",
    colors: [
      { id: "c_petg_black", name: "PET-G Czarny", hex: "#1A1A1A" },
      { id: "c_petg_white", name: "PET-G Biały", hex: "#F8F9FA" },
      { id: "c_petg_grey", name: "PET-G Szary", hex: "#6C757D" },
      { id: "c_petg_clear", name: "PET-G Transparent Clear", hex: "#E9ECEF" },
      { id: "c_petg_blue", name: "PET-G Niebieski", hex: "#0D6EFD" },
      { id: "c_petg_red", name: "PET-G Czerwony", hex: "#DC3545" },
    ]
  },

  // TECHNICZNE & OUTDOOR
  {
    id: "ASA_UV",
    group: "tech",
    name: "ASA Odporny UV & Outdoor",
    badge: "Do Zastosowań Zewnętrznych",
    desc: "Materiał stworzony na zewnątrz i do motoryzacji. Odporny na promienie słoneczne UV, deszcz i mróz.",
    pricePerCm3: 0.65,
    density: 1.07,
    hdt: "95°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Maksymalna (Outdoor)",
    colors: [
      { id: "c_asa_black", name: "ASA Czarny Mat", hex: "#1B1B1C" },
      { id: "c_asa_white", name: "ASA Czysty Biały", hex: "#F8F9FA" },
      { id: "c_asa_grey", name: "ASA Szary Techniczny", hex: "#6C757D" },
      { id: "c_asa_klein", name: "ASA Klein Blue", hex: "#1729AB" },
    ]
  },
  {
    id: "ABS_INDUSTRY",
    group: "tech",
    name: "ABS Przemysłowy",
    badge: "Wysoka Udarność",
    desc: "Klasyczny materiał inżynieryjny o wysokiej sztywności, twardości i odporności na uderzenia.",
    pricePerCm3: 0.58,
    density: 1.05,
    hdt: "90°C",
    tensileStrength: "Wysoka",
    uvResistance: "Średnia",
    colors: [
      { id: "c_abs_black", name: "ABS Czarny", hex: "#212529" },
      { id: "c_abs_white", name: "ABS Biały", hex: "#F8F9FA" },
      { id: "c_abs_grey", name: "ABS Szary", hex: "#495057" },
    ]
  },
  {
    id: "PCTG_PRO",
    group: "tech",
    name: "PCTG Ultra-Wytrzymały",
    badge: "Wytrzymałość Uderzeniowa",
    desc: "Ewolucja PET-G o kilkukrotnie wyższej odporności na pękanie i uderzenia dynamiczne.",
    pricePerCm3: 0.60,
    density: 1.23,
    hdt: "76°C",
    tensileStrength: "Ekstremalna",
    uvResistance: "Dobra",
    colors: [
      { id: "c_pctg_black", name: "PCTG Czarny", hex: "#17181A" },
      { id: "c_pctg_trans", name: "PCTG Krystaliczny Clear", hex: "#E9ECEF" },
      { id: "c_pctg_blue", name: "PCTG Transparent Błękit", hex: "#0288D1" },
    ]
  },
  {
    id: "PP_TECH",
    group: "tech",
    name: "PP Polipropylen Chemioodporny",
    badge: "Odporność Chemiczna",
    desc: "Wyjątkowa odporność na agresywne chemikalia, kwasy i rozpuszczalniki. Atestowana niska gęstość.",
    pricePerCm3: 0.75,
    density: 0.90,
    hdt: "85°C",
    tensileStrength: "Elastyczno-wytrzymała",
    uvResistance: "Dobra",
    colors: [
      { id: "c_pp_nat", name: "PP Mleczny Naturalny", hex: "#EDEDE8" },
      { id: "c_pp_black", name: "PP Czarny Techniczny", hex: "#202124" },
    ]
  },

  // ELASTYCZNE (FLEX / TPU)
  {
    id: "TPU_FLEX",
    group: "flex",
    name: "TPU 95A / Flex Gumowy",
    badge: "Elastyczny / Amortyzujący",
    desc: "Termoplastyczny poliuretan o twardości 95A. Idealny na uszczelki, odbojniki, etui i elastyczne złącza.",
    pricePerCm3: 0.70,
    density: 1.21,
    hdt: "60°C",
    tensileStrength: "Elastyczna guma (300% rozciągliwości)",
    uvResistance: "Bardzo dobra",
    colors: [
      { id: "c_tpu_black", name: "Flex TPU Czarny", hex: "#212529" },
      { id: "c_tpu_white", name: "Flex TPU Biały", hex: "#F8F9FA" },
      { id: "c_tpu_red", name: "Flex TPU Czerwony", hex: "#DC3545" },
      { id: "c_tpu_blue", name: "Flex TPU Błękitny", hex: "#0D6EFD" },
      { id: "c_tpu_yellow", name: "Flex TPU Żółty Neon", hex: "#FFC107" },
    ]
  },

  // KOMPOZYTY (CARBON FIBER)
  {
    id: "PA12_CF15",
    group: "composite",
    name: "Nylon PA12 + CF15 (Włókno Węglowe)",
    badge: "Klasa Przemysłowa",
    desc: "Nylon wzmocniony w 15% ciętym włóknem węglowym. Zastępuje stopy aluminium w częściach maszyn i dronach.",
    pricePerCm3: 1.15,
    density: 1.25,
    hdt: "155°C",
    tensileStrength: "Ekstremalna sztywność",
    uvResistance: "Maksymalna",
    colors: [
      { id: "c_pa12cf_black", name: "Carbon Fiber Grafitowy Mat", hex: "#252628" },
    ]
  },
  {
    id: "PCTG_CF10",
    group: "composite",
    name: "PCTG + CF10 Carbon",
    badge: "Sztywny & Lekki",
    desc: "PCTG z dodatkiem 10% włókna węglowego. Bezskurczowy, sztywny i matowo wykończony.",
    pricePerCm3: 0.95,
    density: 1.28,
    hdt: "85°C",
    tensileStrength: "Bardzo wysoka",
    uvResistance: "Bardzo dobra",
    colors: [
      { id: "c_pctgcf_black", name: "Carbon Czarny Mat", hex: "#222325" },
    ]
  }
];

// Backwards compatibility aliases
export const FILAMENT_DATABASE = ALL_KEYCHAIN_COLORS;
export const TIERS = [
  { id: "all", label: "Wszystkie" },
  { id: "standard", label: "PLA Standard" },
  { id: "premium", label: "Silk / Wood / Dual" }
];
export const MATERIAL_TYPES = KEYCHAIN_CATEGORIES;