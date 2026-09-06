#!/usr/bin/env python3
"""
Drukstacja - Skrypt migracyjny i seedujący bazę PostgreSQL (Railway)
Tworzy tabelę 'filaments' i wypełnia ją początkowym katalogiem materiałów i kolorów.
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import Json

# Ładowanie zmiennych środowiskowych z backend/.env lub .env w katalogu głównym
env_paths = [
    Path(__file__).parent / ".env",
    Path(__file__).parent.parent / ".env",
    Path(".env")
]
for p in env_paths:
    if p.exists():
        load_dotenv(p)
        break


# --------------------------------------------------------------------------
# BAZA DANYCH - POCZĄTKOWY KATALOG MATERIAŁÓW (SEED DATA)
# --------------------------------------------------------------------------
SEED_FILAMENTS = [
    # --- PLA STANDARD (Tier: standard, Type: PLA, Category: single) ---
    {"id": "kc_pla_white", "name": "Czysta Biel", "tier": "standard", "type": "PLA", "category": "single", "hex": "#E6E6E2", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_bone", "name": "Kość Słoniowa", "tier": "standard", "type": "PLA", "category": "single", "hex": "#ECE4D8", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_black", "name": "Głęboka Czerń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#222222", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_grey", "name": "Szary Standard", "tier": "standard", "type": "PLA", "category": "single", "hex": "#6B6E6E", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_dark_gray", "name": "Ciemnoszary", "tier": "standard", "type": "PLA", "category": "single", "hex": "#474A4D", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_red", "name": "Ognista Czerwień", "tier": "standard", "type": "PLA", "category": "single", "hex": "#B34044", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_dark_red", "name": "Bordo / Ciemnoczerwony", "tier": "standard", "type": "PLA", "category": "single", "hex": "#8A171A", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_blue", "name": "Kobaltowy Błękit", "tier": "standard", "type": "PLA", "category": "single", "hex": "#0063A0", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_sky", "name": "Błękit Nieba", "tier": "standard", "type": "PLA", "category": "single", "hex": "#0CB7CC", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_navy", "name": "Granatowy", "tier": "standard", "type": "PLA", "category": "single", "hex": "#133E7C", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_green", "name": "Żywa Zieleń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#4EE349", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_dark_green", "name": "Ciemna Zieleń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#145A32", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_yellow", "name": "Czysty Żółty", "tier": "standard", "type": "PLA", "category": "single", "hex": "#FFBD2C", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_orange", "name": "Pomarańczowy", "tier": "standard", "type": "PLA", "category": "single", "hex": "#E65C00", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_purple", "name": "Fiolet", "tier": "standard", "type": "PLA", "category": "single", "hex": "#8887C5", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_pink", "name": "Różowy", "tier": "standard", "type": "PLA", "category": "single", "hex": "#E881A6", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_skin", "name": "Cielisty Beż", "tier": "standard", "type": "PLA", "category": "single", "hex": "#F7BEA1", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_brown", "name": "Ciepły Brąz", "tier": "standard", "type": "PLA", "category": "single", "hex": "#8E6B4E", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_silver", "name": "Srebrny", "tier": "standard", "type": "PLA", "category": "single", "hex": "#8A8D8F", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_gold", "name": "Złoty Standard", "tier": "standard", "type": "PLA", "category": "single", "hex": "#D4AF37", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},
    {"id": "kc_pla_copper", "name": "Miedź Standard", "tier": "standard", "type": "PLA", "category": "single", "hex": "#A0522D", "colors": None, "price_per_cm3": 0.38, "roughness": 0.40, "metalness": 0.05},

    # --- MATTE / SATIN (Tier: standard, Type: PLA, Category: single) ---
    {"id": "kc_mat_white", "name": "Matte Czysta Biel", "tier": "standard", "type": "PLA", "category": "single", "hex": "#F1F2F6", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_black", "name": "Matte Głęboka Czerń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#1E1E1E", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_gray", "name": "Matte Szary Neutralny", "tier": "standard", "type": "PLA", "category": "single", "hex": "#747D8C", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_graphite", "name": "Matte Grafit Ciemny", "tier": "standard", "type": "PLA", "category": "single", "hex": "#2F3542", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_red", "name": "Matte Karminowa Czerwień", "tier": "standard", "type": "PLA", "category": "single", "hex": "#FF4757", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_blue", "name": "Matte Błękit Kobalt", "tier": "standard", "type": "PLA", "category": "single", "hex": "#1E90FF", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_green", "name": "Matte Soczysta Zieleń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#2ED573", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_yellow", "name": "Matte Ciepły Żółty", "tier": "standard", "type": "PLA", "category": "single", "hex": "#FFA502", "colors": None, "price_per_cm3": 0.42, "roughness": 0.90, "metalness": 0.0},
    {"id": "kc_mat_satin_pearl", "name": "Satin Jedwabista Perła", "tier": "standard", "type": "PLA", "category": "single", "hex": "#EDECE8", "colors": None, "price_per_cm3": 0.42, "roughness": 0.65, "metalness": 0.05},
    {"id": "kc_mat_satin_black", "name": "Satin Satynowa Czerń", "tier": "standard", "type": "PLA", "category": "single", "hex": "#28292B", "colors": None, "price_per_cm3": 0.42, "roughness": 0.65, "metalness": 0.05},

    # --- SILK (Tier: premium, Type: SILK, Category: single) ---
    {"id": "kc_silk_gold", "name": "Silk Złoty", "tier": "premium", "type": "SILK", "category": "single", "hex": "#D4AF37", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.40},
    {"id": "kc_silk_silver", "name": "Silk Srebrny", "tier": "premium", "type": "SILK", "category": "single", "hex": "#A6A8A9", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.45},
    {"id": "kc_silk_copper", "name": "Silk Miedź", "tier": "premium", "type": "SILK", "category": "single", "hex": "#B87333", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.40},
    {"id": "kc_silk_blue", "name": "Silk Błękitny", "tier": "premium", "type": "SILK", "category": "single", "hex": "#33ACD4", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.25},
    {"id": "kc_silk_red", "name": "Silk Czerwony", "tier": "premium", "type": "SILK", "category": "single", "hex": "#C83232", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.25},
    {"id": "kc_silk_green", "name": "Silk Szmaragdowy", "tier": "premium", "type": "SILK", "category": "single", "hex": "#27AE60", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.25},
    {"id": "kc_silk_purple", "name": "Silk Fioletowy", "tier": "premium", "type": "SILK", "category": "single", "hex": "#9B59B6", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.25},
    {"id": "kc_silk_candy", "name": "Silk Candy Róż", "tier": "premium", "type": "SILK", "category": "single", "hex": "#ED8E93", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.25},
    {"id": "kc_silk_black", "name": "Silk Grafit / Czerń", "tier": "premium", "type": "SILK", "category": "single", "hex": "#444444", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.35},
    {"id": "kc_silk_white", "name": "Silk Perłowy Biały", "tier": "premium", "type": "SILK", "category": "single", "hex": "#F0F0EE", "colors": None, "price_per_cm3": 0.50, "roughness": 0.22, "metalness": 0.20},

    # --- WOOD (Tier: premium, Type: WOOD, Category: single) ---
    {"id": "kc_wood_birch", "name": "Drewno Jasna Brzoza / Sosna", "tier": "premium", "type": "WOOD", "category": "single", "hex": "#D7BA89", "colors": None, "price_per_cm3": 0.55, "roughness": 0.94, "metalness": 0.0},
    {"id": "kc_wood_oak", "name": "Drewno Dąb Naturalny", "tier": "premium", "type": "WOOD", "category": "single", "hex": "#B48A5E", "colors": None, "price_per_cm3": 0.55, "roughness": 0.94, "metalness": 0.0},
    {"id": "kc_wood_walnut", "name": "Drewno Ciemny Orzech", "tier": "premium", "type": "WOOD", "category": "single", "hex": "#70482B", "colors": None, "price_per_cm3": 0.55, "roughness": 0.94, "metalness": 0.0},
    {"id": "kc_wood_ebony", "name": "Drewno Hebanowe", "tier": "premium", "type": "WOOD", "category": "single", "hex": "#3E2718", "colors": None, "price_per_cm3": 0.55, "roughness": 0.94, "metalness": 0.0},

    # --- DUAL-COLOR (Tier: premium, Type: MULTICOLOR, Category: dual) ---
    {"id": "kc_dual_red_blue", "name": "Dual Czerwony / Niebieski", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#6F4FA6", "colors": ["#C0292B", "#0984E3"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_black_gold", "name": "Dual Czarny / Złoty", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#7D6F3C", "colors": ["#1E272C", "#D4AF37"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_red_gold", "name": "Dual Czerwony / Złoty", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#D56F34", "colors": ["#D63031", "#D4AF37"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_pink_gold", "name": "Dual Różowy / Złoty", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#E89470", "colors": ["#FD79A8", "#D4AF37"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_black_white", "name": "Dual Czarny / Biały", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#868D90", "colors": ["#1E272C", "#DFE6E9"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_black_green", "name": "Dual Czarny / Zieleń", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#167666", "colors": ["#1E272C", "#00B894"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_black_purple", "name": "Dual Czarny / Fiolet", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#4C488F", "colors": ["#1E272C", "#6C5CE7"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_blue_green", "name": "Dual Błękit / Zieleń", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#059EBC", "colors": ["#0984E3", "#00B894"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_dual_green_purple", "name": "Dual Zieleń / Fiolet", "tier": "premium", "type": "MULTICOLOR", "category": "dual", "hex": "#368A8E", "colors": ["#00B894", "#6C5CE7"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},

    # --- TRI-COLOR (Tier: premium, Type: MULTICOLOR, Category: tri) ---
    {"id": "kc_tri_ryb", "name": "Tri Czerwony / Żółty / Błękit", "tier": "premium", "type": "MULTICOLOR", "category": "tri", "hex": "#B58080", "colors": ["#D63031", "#FDCB6E", "#0984E3"], "price_per_cm3": 0.65, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_tri_bgp", "name": "Tri Błękit / Zieleń / Fiolet", "tier": "premium", "type": "MULTICOLOR", "category": "tri", "hex": "#2789C0", "colors": ["#0984E3", "#00B894", "#6C5CE7"], "price_per_cm3": 0.65, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_tri_ryg", "name": "Tri Czerwony / Żółty / Zieleń", "tier": "premium", "type": "MULTICOLOR", "category": "tri", "hex": "#A7B33C", "colors": ["#D63031", "#F1C40F", "#2ECC71"], "price_per_cm3": 0.65, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_tri_bgpur", "name": "Tri Czarny / Złoty / Fiolet", "tier": "premium", "type": "MULTICOLOR", "category": "tri", "hex": "#83796E", "colors": ["#2C3E50", "#D4AF37", "#8E44AD"], "price_per_cm3": 0.65, "roughness": 0.28, "metalness": 0.15},

    # --- RAINBOW (Tier: premium, Type: MULTICOLOR, Category: rainbow) ---
    {"id": "kc_rainbow_1", "name": "Rainbow Classic (Tęcza)", "tier": "premium", "type": "MULTICOLOR", "category": "rainbow", "hex": "#A29BFE", "colors": ["#E84393", "#FDCB6E", "#00B894", "#0984E3"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_rainbow_2", "name": "Rainbow Pastel Candy", "tier": "premium", "type": "MULTICOLOR", "category": "rainbow", "hex": "#FBC531", "colors": ["#FF7675", "#FFEAA7", "#55EFC4", "#74B9FF"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},
    {"id": "kc_rainbow_3", "name": "Rainbow Jesień / Forest", "tier": "premium", "type": "MULTICOLOR", "category": "rainbow", "hex": "#B9770E", "colors": ["#D35400", "#F39C12", "#27AE60", "#2C3E50"], "price_per_cm3": 0.60, "roughness": 0.28, "metalness": 0.15},

    # --- PET-G (Tier: standard, Type: PETG, Category: single) ---
    {"id": "mat_petg_black", "name": "PET-G Czarny", "tier": "standard", "type": "PETG", "category": "single", "hex": "#1A1A1A", "colors": None, "price_per_cm3": 0.44, "roughness": 0.30, "metalness": 0.10},
    {"id": "mat_petg_white", "name": "PET-G Biały", "tier": "standard", "type": "PETG", "category": "single", "hex": "#F8F9FA", "colors": None, "price_per_cm3": 0.44, "roughness": 0.30, "metalness": 0.10},
    {"id": "mat_petg_grey", "name": "PET-G Szary", "tier": "standard", "type": "PETG", "category": "single", "hex": "#6C757D", "colors": None, "price_per_cm3": 0.44, "roughness": 0.30, "metalness": 0.10},
    {"id": "mat_petg_clear", "name": "PET-G Transparent Clear", "tier": "standard", "type": "PETG", "category": "single", "hex": "#E9ECEF", "colors": None, "price_per_cm3": 0.44, "roughness": 0.20, "metalness": 0.10},
    {"id": "mat_petg_blue", "name": "PET-G Niebieski", "tier": "standard", "type": "PETG", "category": "single", "hex": "#0D6EFD", "colors": None, "price_per_cm3": 0.44, "roughness": 0.30, "metalness": 0.10},
    {"id": "mat_petg_red", "name": "PET-G Czerwony", "tier": "standard", "type": "PETG", "category": "single", "hex": "#DC3545", "colors": None, "price_per_cm3": 0.44, "roughness": 0.30, "metalness": 0.10},

    # --- FLEX / TPU (Tier: premium, Type: FLEX, Category: single) ---
    {"id": "mat_tpu_black", "name": "Flex TPU 95A Czarny", "tier": "premium", "type": "FLEX", "category": "single", "hex": "#212529", "colors": None, "price_per_cm3": 0.70, "roughness": 0.60, "metalness": 0.0},
    {"id": "mat_tpu_white", "name": "Flex TPU 95A Biały", "tier": "premium", "type": "FLEX", "category": "single", "hex": "#F8F9FA", "colors": None, "price_per_cm3": 0.70, "roughness": 0.60, "metalness": 0.0},
    {"id": "mat_tpu_red", "name": "Flex TPU 95A Czerwony", "tier": "premium", "type": "FLEX", "category": "single", "hex": "#DC3545", "colors": None, "price_per_cm3": 0.70, "roughness": 0.60, "metalness": 0.0},
    {"id": "mat_tpu_blue", "name": "Flex TPU 95A Błękitny", "tier": "premium", "type": "FLEX", "category": "single", "hex": "#0D6EFD", "colors": None, "price_per_cm3": 0.70, "roughness": 0.60, "metalness": 0.0},
    {"id": "mat_tpu_yellow", "name": "Flex TPU 95A Żółty Neon", "tier": "premium", "type": "FLEX", "category": "single", "hex": "#FFC107", "colors": None, "price_per_cm3": 0.70, "roughness": 0.60, "metalness": 0.0},

    # --- TECHNICAL / OUTDOOR (Tier: premium, Type: TECH, Category: single) ---
    {"id": "mat_asa_black", "name": "ASA Outdoor Czarny Mat", "tier": "premium", "type": "TECH", "category": "single", "hex": "#1B1B1C", "colors": None, "price_per_cm3": 0.65, "roughness": 0.70, "metalness": 0.05},
    {"id": "mat_asa_white", "name": "ASA Outdoor Czysty Biały", "tier": "premium", "type": "TECH", "category": "single", "hex": "#F8F9FA", "colors": None, "price_per_cm3": 0.65, "roughness": 0.70, "metalness": 0.05},
    {"id": "mat_asa_grey", "name": "ASA Outdoor Szary Techniczny", "tier": "premium", "type": "TECH", "category": "single", "hex": "#6C757D", "colors": None, "price_per_cm3": 0.65, "roughness": 0.70, "metalness": 0.05},
    {"id": "mat_abs_black", "name": "ABS Przemysłowy Czarny", "tier": "standard", "type": "TECH", "category": "single", "hex": "#212529", "colors": None, "price_per_cm3": 0.58, "roughness": 0.50, "metalness": 0.05},
    {"id": "mat_pctg_black", "name": "PCTG Wytrzymały Czarny", "tier": "premium", "type": "TECH", "category": "single", "hex": "#17181A", "colors": None, "price_per_cm3": 0.60, "roughness": 0.35, "metalness": 0.08},
    {"id": "mat_pp_nat", "name": "PP Polipropylen Mleczny", "tier": "premium", "type": "TECH", "category": "single", "hex": "#EDEDE8", "colors": None, "price_per_cm3": 0.75, "roughness": 0.60, "metalness": 0.0},

    # --- COMPOSITE CARBON FIBER (Tier: premium, Type: COMPOSITE, Category: single) ---
    {"id": "mat_pa12_cf", "name": "Nylon PA12-CF15 Carbon Fiber", "tier": "premium", "type": "COMPOSITE", "category": "single", "hex": "#252628", "colors": None, "price_per_cm3": 1.15, "roughness": 0.85, "metalness": 0.15},
    {"id": "mat_pctg_cf", "name": "PCTG-CF10 Carbon Czarny Mat", "tier": "premium", "type": "COMPOSITE", "category": "single", "hex": "#222325", "colors": None, "price_per_cm3": 0.95, "roughness": 0.85, "metalness": 0.10},
]


def get_db_connection():
    """Tworzy połączenie z PostgreSQL za pomocą DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL")
    if len(sys.argv) > 1 and sys.argv[1].startswith(("postgres://", "postgresql://")):
        db_url = sys.argv[1]

    if not db_url:
        print("\n[BŁĄD] Nie znaleziono zmiennej DATABASE_URL w środowisku ani w plikach .env!")
        print("Możesz podać URL bezpośrednio jako argument:")
        print("    python db_setup.py postgresql://postgres:haslo@host:port/dbname\n")
        sys.exit(1)

    # Poprawka dla Railway / SQLAlchemy / psycopg2 (postgres:// -> postgresql://)
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    return psycopg2.connect(db_url)


def setup_database():
    """Tworzy tabelę filaments i seeduje dane."""
    print("=" * 60)
    print("  DRUKSTACJA - KONFIGURATOR BAZY POSTGRESQL (RAILWAY)")
    print("=" * 60)

    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit = True
        cur = conn.cursor()

        print("[1/3] Tworzenie tabeli 'filaments'...")
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS filaments (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            tier VARCHAR(20) NOT NULL DEFAULT 'standard',
            type VARCHAR(20) NOT NULL,
            category VARCHAR(20) NOT NULL DEFAULT 'single',
            hex VARCHAR(10),
            colors JSONB,
            price_per_cm3 NUMERIC(5, 2) DEFAULT 0.40,
            in_stock BOOLEAN DEFAULT true,
            roughness NUMERIC(3, 2) DEFAULT 0.40,
            metalness NUMERIC(3, 2) DEFAULT 0.05
        );
        """
        cur.execute(create_table_sql)
        print("      ✓ Tabela 'filaments' istnieje / została utworzona.")

        print("[2/3] Weryfikacja tabeli 'orders' i kolumny 'production_file_url'...")
        orders_migration_sql = """
        CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID,
            file_name VARCHAR(255),
            material VARCHAR(100),
            technology VARCHAR(255),
            layer_height VARCHAR(50),
            infill INT,
            clean_supports BOOLEAN DEFAULT true,
            brass_inserts BOOLEAN DEFAULT false,
            quantity INT DEFAULT 1,
            total_price NUMERIC(10, 2),
            dimensions_mm INT[],
            status VARCHAR(50) DEFAULT 'in_cart',
            production_file_url VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_file_url VARCHAR(255);
        """
        cur.execute(orders_migration_sql)
        print("      ✓ Tabela 'orders' z kolumną 'production_file_url' jest gotowa.")

        print(f"[3/3] Seedowanie {len(SEED_FILAMENTS)} filamentów (ON CONFLICT DO NOTHING)...")
        insert_sql = """
        INSERT INTO filaments (
            id, name, tier, type, category, hex, colors, price_per_cm3, in_stock, roughness, metalness
        ) VALUES (
            %(id)s, %(name)s, %(tier)s, %(type)s, %(category)s, %(hex)s, %(colors)s, %(price_per_cm3)s, true, %(roughness)s, %(metalness)s
        )
        ON CONFLICT (id) DO NOTHING;
        """

        for item in SEED_FILAMENTS:
            payload = dict(item)
            if payload["colors"] is not None:
                payload["colors"] = Json(payload["colors"])
            else:
                payload["colors"] = None
            cur.execute(insert_sql, payload)

        cur.execute("SELECT COUNT(*) FROM filaments;")
        total_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM filaments WHERE in_stock = true;")
        in_stock_count = cur.fetchone()[0]

        print(f"      ✓ Zakończono seedowanie!")
        print(f"      ✓ Łącznie w bazie: {total_count} pozycji ({in_stock_count} oznaczonych jako dostępne w magazynie).")
        print("\n[SUKCES] Baza PostgreSQL jest w pełni gotowa do zarządzania przez Railway Data View!")
        cur.close()

    except Exception as e:
        print(f"\n[BŁĄD] Wystąpił problem z bazą: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    setup_database()
