// frontend/config/filamentDatabase.js
export const FILAMENT_CATEGORIES = {
  PLA_STANDARD: "PLA",
  PLA_WOOD: "PLA Wood",
  PLA_SILK_DUAL: "Silk Dual-Color",
  PLA_SILK_TRI: "Silk Tri-Color",
  PLA_GALAXY: "PLA Galaxy",
  PLA_RAINBOW: "PLA Rainbow",
};

export const FILAMENTS = [
  // --- SUNLU PLA (Standard & Transparent) ---
  { id: "pla_beige", name: "Beige", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#E8D8C8", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_bone_white", name: "Bone White", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#F3EFE6", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_ceramic", name: "Ceramic White", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FFFFFF", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_coffee_brown", name: "Coffee Brown", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#5C3A21", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_chocolate", name: "Chocolate", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#381E11", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_cyan", name: "Cyan", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#00BCDB", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_grey", name: "Grey", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#8E9297", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_green", name: "Green", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#0E8A37", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_light_green", name: "Light Green", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#78C850", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_midnight", name: "Midnight Black", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#111215", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_roasted_chestnut", name: "Roasted Chestnut", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#6E3725", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_klein_blue", name: "Klein Blue", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#002FA7", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_lemon_yellow", name: "Lemon Yellow", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FFF033", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_yellow", name: "Yellow", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FFCD00", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_light_gold", name: "Light Gold", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#D4AF37", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_silver", name: "Silver", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#C5C6C7", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_sakura_pink", name: "Sakura Pink", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FFB3C6", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_sunny_orange", name: "Sunny Orange", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FF6B00", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_sky_blue", name: "Sky Blue", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#56CCF2", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_red", name: "Red", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#D81E06", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_lavender_purple", name: "Lavender Purple", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#9B72CF", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_mint_green", name: "Mint Green", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#88D49E", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_transparent", name: "Transparent", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#ECEFF1", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },
  { id: "pla_olive_green", name: "Olive Green", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#556B2F", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_magenta", name: "Magenta", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#C2185B", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_vivid_yellow", name: "Vivid Yellow", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FFD000", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_oak", name: "Oak", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#8F6843", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.24 },
  { id: "pla_trans_red", name: "Transparent Red", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#E53935", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },
  { id: "pla_trans_orange", name: "Transparent Orange", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FB8C00", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },
  { id: "pla_trans_green", name: "Transparent Green", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#43A047", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },
  { id: "pla_trans_yellow", name: "Transparent Yellow", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#FDD835", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },
  { id: "pla_trans_purple", name: "Transparent Purple", category: FILAMENT_CATEGORIES.PLA_STANDARD, hex: "#8E24AA", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21, transparent: true },

  // --- PLA Wood ---
  { id: "wood_maple", name: "Maple Wood", category: FILAMENT_CATEGORIES.PLA_WOOD, hex: "#C49A6C", type: "PLA", nozzleTemp: 205, bedTemp: 45, density: 1.25 },
  { id: "wood_natural", name: "Wood", category: FILAMENT_CATEGORIES.PLA_WOOD, hex: "#A87C4F", type: "PLA", nozzleTemp: 205, bedTemp: 45, density: 1.25 },
  { id: "wood_walnut", name: "Walnut Wood", category: FILAMENT_CATEGORIES.PLA_WOOD, hex: "#533826", type: "PLA", nozzleTemp: 205, bedTemp: 45, density: 1.25 },
  { id: "wood_cherry", name: "Cherry Wood", category: FILAMENT_CATEGORIES.PLA_WOOD, hex: "#7A2F21", type: "PLA", nozzleTemp: 205, bedTemp: 45, density: 1.25 },

  // --- Silk Dual Color ---
  { id: "silk_dual_black_blue", name: "Black Blue", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#1A237E", gradient: "linear-gradient(135deg, #111 50%, #1565C0 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_black_purple", name: "Black Purple", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#4A148C", gradient: "linear-gradient(135deg, #111 50%, #7B1FA2 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_black_green", name: "Black Green", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#1B5E20", gradient: "linear-gradient(135deg, #111 50%, #2E7D32 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_black_white", name: "Black White", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#757575", gradient: "linear-gradient(135deg, #111 50%, #FFF 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_blue_green", name: "Blue Green", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#00897B", gradient: "linear-gradient(135deg, #0288D1 50%, #43A047 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_green_purple", name: "Green Purple", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#6A1B9A", gradient: "linear-gradient(135deg, #2E7D32 50%, #8E24AA 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_red_blue", name: "Red Blue", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#880E4F", gradient: "linear-gradient(135deg, #D32F2F 50%, #1976D2 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_red_gold", name: "Red Gold", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#B71C1C", gradient: "linear-gradient(135deg, #D32F2F 50%, #FFB300 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_dual_pink_gold", name: "Pink Gold", category: FILAMENT_CATEGORIES.PLA_SILK_DUAL, hex: "#F48FB1", gradient: "linear-gradient(135deg, #EC407A 50%, #FFD54F 50%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },

  // --- Silk Tri Color ---
  { id: "silk_tri_black_gold_purple", name: "Black Gold Purple", category: FILAMENT_CATEGORIES.PLA_SILK_TRI, hex: "#6A1B9A", gradient: "linear-gradient(135deg, #111 33%, #FFB300 33% 66%, #8E24AA 66%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_tri_orange_blue_green", name: "Orange Blue Green", category: FILAMENT_CATEGORIES.PLA_SILK_TRI, hex: "#00897B", gradient: "linear-gradient(135deg, #FF6D00 33%, #0288D1 33% 66%, #2E7D32 66%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_tri_red_yellow_green", name: "Red Yellow Green", category: FILAMENT_CATEGORIES.PLA_SILK_TRI, hex: "#FBC02D", gradient: "linear-gradient(135deg, #D32F2F 33%, #FDD835 33% 66%, #388E3C 66%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_tri_red_yellow_blue", name: "Red Yellow Blue", category: FILAMENT_CATEGORIES.PLA_SILK_TRI, hex: "#D32F2F", gradient: "linear-gradient(135deg, #D32F2F 33%, #FDD835 33% 66%, #1976D2 66%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },
  { id: "silk_tri_blue_green_purple", name: "Blue Green Purple", category: FILAMENT_CATEGORIES.PLA_SILK_TRI, hex: "#512DA8", gradient: "linear-gradient(135deg, #1976D2 33%, #388E3C 33% 66%, #7B1FA2 66%)", type: "PLA-Silk", nozzleTemp: 220, bedTemp: 55, density: 1.23 },

  // --- PLA Galaxy ---
  { id: "galaxy_starlit_flow", name: "Starlit Flow", category: FILAMENT_CATEGORIES.PLA_GALAXY, hex: "#1A2A44", gradient: "radial-gradient(circle, #2A4365, #0F172A)", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.22 },
  { id: "galaxy_green", name: "Galaxy Green", category: FILAMENT_CATEGORIES.PLA_GALAXY, hex: "#143D28", gradient: "radial-gradient(circle, #1F5F3E, #092013)", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.22 },
  { id: "galaxy_stardust_purple", name: "Stardust Purple", category: FILAMENT_CATEGORIES.PLA_GALAXY, hex: "#381E47", gradient: "radial-gradient(circle, #552B6F, #220F2E)", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.22 },
  { id: "galaxy_star_brown", name: "Star Brown", category: FILAMENT_CATEGORIES.PLA_GALAXY, hex: "#42281D", gradient: "radial-gradient(circle, #5F3826, #2B1810)", type: "PLA", nozzleTemp: 215, bedTemp: 55, density: 1.22 },

  // --- PLA Rainbow ---
  { id: "rainbow_01", name: "Rainbow 01", category: FILAMENT_CATEGORIES.PLA_RAINBOW, hex: "#E91E63", gradient: "linear-gradient(90deg, #E91E63, #9C27B0, #2196F3, #4CAF50, #FFEB3B, #FF9800)", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21 },
  { id: "rainbow_02", name: "Rainbow 02", category: FILAMENT_CATEGORIES.PLA_RAINBOW, hex: "#00BCD4", gradient: "linear-gradient(90deg, #00BCD4, #8BC34A, #CDDC39, #FFC107, #FF5722)", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21 },
  { id: "rainbow_03", name: "Rainbow 03", category: FILAMENT_CATEGORIES.PLA_RAINBOW, hex: "#AB47BC", gradient: "linear-gradient(90deg, #7E57C2, #42A5F5, #26A69A, #D4E157, #FFA726)", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21 },
  { id: "rainbow_04", name: "Rainbow 04", category: FILAMENT_CATEGORIES.PLA_RAINBOW, hex: "#26C6DA", gradient: "linear-gradient(90deg, #26C6DA, #80CBC4, #B2DFDB, #FFE082, #FFAB91)", type: "PLA", nozzleTemp: 210, bedTemp: 55, density: 1.21 },
];

export function getFilamentById(id) {
  if (!id) return null;
  return FILAMENTS.find((f) => f.id === id) || null;
}

export function getFilamentByHex(hex) {
  if (!hex) return null;
  const clean = hex.trim().toUpperCase();
  return FILAMENTS.find((f) => f.hex.toUpperCase() === clean) || null;
}
