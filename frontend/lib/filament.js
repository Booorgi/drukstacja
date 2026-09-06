export const SUNLU_CATALOG = {
  materials: [
    { id: "PLA_PLUS", name: "Sunlu PLA+", type: "Standard", density: 1.24, pricePerCm3: 0.40 },
    { id: "PETG", name: "Sunlu PETG", type: "Technical", density: 1.27, pricePerCm3: 0.45 },
    { id: "SILK_PLA", name: "Sunlu Silk PLA", type: "Aesthetic", density: 1.25, pricePerCm3: 0.50 },
    { id: "TPU_95A", name: "Sunlu TPU 95A", type: "Flexible", density: 1.21, pricePerCm3: 0.65 },
    { id: "ASA", name: "Sunlu ASA UV", type: "Outdoor", density: 1.07, pricePerCm3: 0.55 },
    { id: "DUAL_COLOR", name: "Sunlu Dual-Color Silk", type: "Multicolor", density: 1.25, pricePerCm3: 0.60 },
    { id: "TRI_COLOR", name: "Sunlu Tri-Color Silk", type: "Multicolor", density: 1.25, pricePerCm3: 0.70 },
    { id: "RAINBOW", name: "Sunlu Rainbow Silk", type: "Gradient", density: 1.25, pricePerCm3: 0.60 },
  ],
  colors: {
    PLA_PLUS: [
      { name: "Czysta Biel", hex: "#E6E6E2", td: 7.5 },
      { name: "Głęboka Czerń", hex: "#3C3C3C", td: 0.1 },
      { name: "Szary Standard", hex: "#6B6E6E", td: 1.2 },
      { name: "Czerwień Ognista", hex: "#B34044", td: 2.2 },
      { name: "Kobaltowy Błękit", hex: "#0063A0", td: 2.5 },
      { name: "Błękit Nieba", hex: "#0CB7CC", td: 4.0 },
      { name: "Żywa Zieleń", hex: "#4EE349", td: 5.2 },
      { name: "Czysty Żółty", hex: "#FFBD2C", td: 4.6 },
      { name: "Fiolet", hex: "#8887C5", td: 4.7 },
      { name: "Cielisty / Beż", hex: "#F7BEA1", td: 6.9 },
    ],
    PETG: [
      { name: "Biały PETG", hex: "#DBDDD9", td: 7.6 },
      { name: "Czarny PETG", hex: "#404141", td: 0.1 },
      { name: "Szary PETG", hex: "#6C6E6F", td: 1.5 },
      { name: "Niebieski PETG", hex: "#0068AB", td: 3.2 },
      { name: "Zielony PETG", hex: "#67DB25", td: 4.5 },
      { name: "Transparent Clear", hex: "#E4E7E3", td: 15.0 },
    ],
    SILK_PLA: [
      { name: "Silk Złoty", hex: "#D4AF37", td: 1.2 },
      { name: "Silk Srebrny", hex: "#A6A8A9", td: 1.0 },
      { name: "Silk Miedź", hex: "#B87333", td: 0.9 },
      { name: "Silk Błękitny", hex: "#33ACD4", td: 1.0 },
      { name: "Silk Candy Róż", hex: "#ED8E93", td: 2.1 },
    ],
    DUAL_COLOR: [
      { name: "Dual Czerwony / Niebieski", colors: ["#C0292B", "#0984E3"], hex: "#6F4FA6" },
      { name: "Dual Czarny / Złoty", colors: ["#2D3436", "#D4AF37"], hex: "#7D6F3C" },
      { name: "Dual Różowy / Złoty", colors: ["#FD79A8", "#D4AF37"], hex: "#E89470" },
      { name: "Dual Niebieski / Zielony", colors: ["#0984E3", "#00B894"], hex: "#059EBC" },
    ],
    TRI_COLOR: [
      { name: "Tri Czerwony / Żółty / Niebieski", colors: ["#D63031", "#FDCB6E", "#0984E3"], hex: "#B58080" },
      { name: "Tri Błękit / Zieleń / Fiolet", colors: ["#0984E3", "#00B894", "#6C5CE7"], hex: "#2789C0" },
    ],
    RAINBOW: [
      { name: "Silk Rainbow Classic", colors: ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], hex: "#A29BFE" },
      { name: "Silk Rainbow Pastel", colors: ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], hex: "#FBC531" },
    ]
  }
};