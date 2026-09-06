export const SUNLU_CATALOG = {
  categories: [
    { id: "PLA_PLUS", label: "PLA+ Standard", badge: "Matowy/Satin" },
    { id: "SILK_PLA", label: "Silk Błysk", badge: "Jedwabny" },
    { id: "PETG", label: "PETG Odporny", badge: "Wytrzymały" },
    { id: "DUAL_COLOR", label: "Dual-Color", badge: "Dwukolorowy" },
    { id: "TRI_COLOR", label: "Tri-Color", badge: "Trzykolorowy" },
    { id: "RAINBOW", label: "Rainbow Silk", badge: "Gradient" },
  ],
  colors: {
    PLA_PLUS: [
      { id: "pla_white", name: "Czysta Biel", hex: "#E6E6E2", type: "single" },
      { id: "pla_black", name: "Głęboka Czerń", hex: "#222222", type: "single" },
      { id: "pla_grey", name: "Szary Standard", hex: "#6B6E6E", type: "single" },
      { id: "pla_red", name: "Ognista Czerwień", hex: "#B34044", type: "single" },
      { id: "pla_blue", name: "Kobaltowy Błękit", hex: "#0063A0", type: "single" },
      { id: "pla_sky", name: "Błękit Nieba", hex: "#0CB7CC", type: "single" },
      { id: "pla_green", name: "Żywa Zieleń", hex: "#4EE349", type: "single" },
      { id: "pla_yellow", name: "Czysty Żółty", hex: "#FFBD2C", type: "single" },
      { id: "pla_orange", name: "Pomarańczowy", hex: "#E65C00", type: "single" },
      { id: "pla_purple", name: "Fiolet", hex: "#8887C5", type: "single" },
      { id: "pla_skin", name: "Cielisty Beż", hex: "#F7BEA1", type: "single" },
      { id: "pla_brown", name: "Ciepły Brąz", hex: "#8E6B4E", type: "single" },
    ],
    SILK_PLA: [
      { id: "silk_gold", name: "Silk Złoty", hex: "#D4AF37", type: "single", metalness: 0.35, roughness: 0.25 },
      { id: "silk_silver", name: "Silk Srebrny", hex: "#A6A8A9", type: "single", metalness: 0.4, roughness: 0.25 },
      { id: "silk_copper", name: "Silk Miedź", hex: "#B87333", type: "single", metalness: 0.35, roughness: 0.25 },
      { id: "silk_blue", name: "Silk Błękitny", hex: "#33ACD4", type: "single", metalness: 0.2, roughness: 0.25 },
      { id: "silk_candy", name: "Silk Candy Róż", hex: "#ED8E93", type: "single", metalness: 0.2, roughness: 0.25 },
      { id: "silk_black", name: "Silk Grafit", hex: "#444444", type: "single", metalness: 0.3, roughness: 0.25 },
      { id: "silk_white", name: "Silk Perłowy", hex: "#F0F0EE", type: "single", metalness: 0.2, roughness: 0.25 },
    ],
    PETG: [
      { id: "petg_white", name: "Biały PETG", hex: "#DBDDD9", type: "single" },
      { id: "petg_black", name: "Czarny PETG", hex: "#1A1A1A", type: "single" },
      { id: "petg_grey", name: "Szary PETG", hex: "#6C6E6F", type: "single" },
      { id: "petg_blue", name: "Niebieski PETG", hex: "#0068AB", type: "single" },
      { id: "petg_green", name: "Zielony PETG", hex: "#67DB25", type: "single" },
      { id: "petg_red", name: "Czerwony PETG", hex: "#B83232", type: "single" },
    ],
    DUAL_COLOR: [
      { id: "dual_red_blue", name: "Dual Czerwony / Niebieski", hex: "#6F4FA6", colors: ["#C0292B", "#0984E3"], type: "dual" },
      { id: "dual_black_gold", name: "Dual Czarny / Złoty", hex: "#7D6F3C", colors: ["#1E272C", "#D4AF37"], type: "dual" },
      { id: "dual_pink_gold", name: "Dual Różowy / Złoty", hex: "#E89470", colors: ["#FD79A8", "#D4AF37"], type: "dual" },
      { id: "dual_blue_green", name: "Dual Błękit / Zieleń", hex: "#059EBC", colors: ["#0984E3", "#00B894"], type: "dual" },
      { id: "dual_black_green", name: "Dual Czarny / Zieleń", hex: "#167666", colors: ["#1E272C", "#00B894"], type: "dual" },
      { id: "dual_black_purple", name: "Dual Czarny / Fiolet", hex: "#4C488F", colors: ["#1E272C", "#6C5CE7"], type: "dual" },
    ],
    TRI_COLOR: [
      { id: "tri_red_yel_blue", name: "Tri Czerwony / Żółty / Błękit", hex: "#B58080", colors: ["#D63031", "#FDCB6E", "#0984E3"], type: "tri" },
      { id: "tri_blue_green_pur", name: "Tri Błękit / Zieleń / Fiolet", hex: "#2789C0", colors: ["#0984E3", "#00B894", "#6C5CE7"], type: "tri" },
      { id: "tri_black_gold_pur", name: "Tri Czarny / Złoty / Fiolet", hex: "#83796E", colors: ["#2C3E50", "#D4AF37", "#8E44AD"], type: "tri" },
    ],
    RAINBOW: [
      { id: "rainbow_classic", name: "Silk Rainbow Classic", hex: "#A29BFE", colors: ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], type: "rainbow" },
      { id: "rainbow_pastel", name: "Silk Rainbow Pastel", hex: "#FBC531", colors: ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], type: "rainbow" },
    ]
  }
};