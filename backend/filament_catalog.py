"""
Katalog filamentów Sunlu / magazyn Drukstacja.

Źródło prawdy dla seeda Postgres, stawek wyceny (zł/kg) i JSON frontendu.
Ceny zł/kg są wyłącznie do kalkulatora — API publiczne ich nie zwraca.
"""
from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

CATALOG_JSON = Path(__file__).resolve().parent / "data" / "filament_catalog.json"
FRONTEND_CATALOG_JSON = (
    Path(__file__).resolve().parent.parent / "frontend" / "config" / "filamentCatalog.json"
)

HEX = {
    "beige": "#E8D8C8",
    "bone white": "#F3EFE6",
    "ceramic": "#FFFFFF",
    "coffee brown": "#5C3A21",
    "chocolate": "#381E11",
    "cyan": "#00BCDB",
    "grey": "#8E9297",
    "gray": "#8E9297",
    "green": "#0E8A37",
    "light green": "#78C850",
    "midnight": "#111215",
    "roasted chestnut": "#6E3725",
    "klein blue": "#002FA7",
    "lemon yellow": "#FFF033",
    "yellow": "#FFCD00",
    "light gold": "#D4AF37",
    "silver": "#C5C6C7",
    "sakura pink": "#FFB3C6",
    "sunny orange": "#FF6B00",
    "sky blue": "#56CCF2",
    "red": "#D81E06",
    "lavender purple": "#9B72CF",
    "lavender": "#9B72CF",
    "mint green": "#88D49E",
    "transparent": "#ECEFF1",
    "olive green": "#556B2F",
    "magenta": "#C2185B",
    "vivid yellow": "#FFD000",
    "oak": "#8F6843",
    "transparent red": "#E53935",
    "transparent orange": "#FB8C00",
    "transparent green": "#43A047",
    "transparent yellow": "#FDD835",
    "transparent purple": "#8E24AA",
    "white": "#F8F9FA",
    "black": "#111215",
    "gold": "#D4AF37",
    "blue": "#1976D2",
    "azure": "#00A3E0",
    "natural": "#EDEDE8",
    "graphite": "#4A4E54",
    "orange": "#FF6D00",
    "cherry red": "#C62828",
}

PLA_STANDARD_COLORS = [
    "beige",
    "bone white",
    "ceramic",
    "coffee brown",
    "chocolate",
    "cyan",
    "grey",
    "green",
    "light green",
    "midnight",
    "roasted chestnut",
    "klein blue",
    "lemon yellow",
    "yellow",
    "light gold",
    "silver",
    "sakura pink",
    "sunny orange",
    "sky blue",
    "red",
    "lavender purple",
    "mint green",
    "transparent",
    "olive green",
    "magenta",
    "vivid yellow",
    "oak",
    "transparent red",
    "transparent orange",
    "transparent green",
    "transparent yellow",
    "transparent purple",
]

PETG_COLORS = [
    "black",
    "white",
    "sakura pink",
    "green",
    "cyan",
    "sunny orange",
    "beige",
    "chocolate",
    "mint green",
    "cherry red",
    "sky blue",
    "lemon yellow",
    "lavender",
    "grey",
    "ceramic",
    "midnight",
    "olive green",
    "oak",
    "vivid yellow",
    "red",
    "silver",
    "magenta",
]

ABS_COLORS = [
    "white",
    "silver",
    "green",
    "beige",
    "olive green",
    "cyan",
    "magenta",
    "grey",
    "gold",
    "yellow",
    "sunny orange",
    "black",
    "coffee brown",
    "blue",
]


def _slug(name: str, prefix: str) -> str:
    token = (
        name.lower()
        .replace(" / ", "_")
        .replace("/", "_")
        .replace(" ", "_")
        .replace("-", "_")
    )
    return f"{prefix}_{token}"


def _title(name: str) -> str:
    if name.lower().startswith("rainbow "):
        return name[:1].upper() + name[1:]
    return " ".join(part.capitalize() if part.lower() != "cf" else "CF" for part in name.split())


def _color(name: str, prefix: str, hex_override: str | None = None, **extra) -> dict:
    hex_code = hex_override or HEX[name.lower()]
    item = {
        "id": _slug(name, prefix),
        "name": _title(name),
        "hex": hex_code,
    }
    if name.lower().startswith("transparent"):
        item["transparent"] = True
    item.update(extra)
    return item


def _palette(names: list[str], prefix: str) -> list[dict]:
    return [_color(n, prefix) for n in names]


def _kg_to_cm3(price_per_kg: float, density: float) -> float:
    return round((price_per_kg / 1000.0) * density, 4)


def _kg_to_g(price_per_kg: float) -> float:
    return round(price_per_kg / 1000.0, 6)


WOOD_COLORS = [
    _color("maple wood", "wood", "#C49A6C"),
    _color("wood", "wood", "#A87C4F"),
    _color("walnut wood", "wood", "#533826"),
    _color("cherry wood", "wood", "#7A2F21"),
]

SILK_DUAL_COLORS = [
    {
        "id": "silk_dual_black_blue",
        "name": "Black Blue",
        "hex": "#1A237E",
        "colors": ["#111111", "#1565C0"],
        "gradient": "linear-gradient(135deg, #111 50%, #1565C0 50%)",
    },
    {
        "id": "silk_dual_black_purple",
        "name": "Black Purple",
        "hex": "#4A148C",
        "colors": ["#111111", "#7B1FA2"],
        "gradient": "linear-gradient(135deg, #111 50%, #7B1FA2 50%)",
    },
    {
        "id": "silk_dual_black_green",
        "name": "Black Green",
        "hex": "#1B5E20",
        "colors": ["#111111", "#2E7D32"],
        "gradient": "linear-gradient(135deg, #111 50%, #2E7D32 50%)",
    },
    {
        "id": "silk_dual_black_white",
        "name": "Black White",
        "hex": "#757575",
        "colors": ["#111111", "#FFFFFF"],
        "gradient": "linear-gradient(135deg, #111 50%, #FFF 50%)",
    },
    {
        "id": "silk_dual_blue_green",
        "name": "Blue Green",
        "hex": "#00897B",
        "colors": ["#0288D1", "#43A047"],
        "gradient": "linear-gradient(135deg, #0288D1 50%, #43A047 50%)",
    },
    {
        "id": "silk_dual_green_purple",
        "name": "Green Purple",
        "hex": "#6A1B9A",
        "colors": ["#2E7D32", "#8E24AA"],
        "gradient": "linear-gradient(135deg, #2E7D32 50%, #8E24AA 50%)",
    },
    {
        "id": "silk_dual_red_blue",
        "name": "Red Blue",
        "hex": "#880E4F",
        "colors": ["#D32F2F", "#1976D2"],
        "gradient": "linear-gradient(135deg, #D32F2F 50%, #1976D2 50%)",
    },
    {
        "id": "silk_dual_red_gold",
        "name": "Red Gold",
        "hex": "#B71C1C",
        "colors": ["#D32F2F", "#FFB300"],
        "gradient": "linear-gradient(135deg, #D32F2F 50%, #FFB300 50%)",
    },
    {
        "id": "silk_dual_pink_gold",
        "name": "Pink Gold",
        "hex": "#F48FB1",
        "colors": ["#EC407A", "#FFD54F"],
        "gradient": "linear-gradient(135deg, #EC407A 50%, #FFD54F 50%)",
    },
]

SILK_TRI_COLORS = [
    {
        "id": "silk_tri_black_gold_purple",
        "name": "Black Gold Purple",
        "hex": "#6A1B9A",
        "colors": ["#111111", "#FFB300", "#8E24AA"],
        "gradient": "linear-gradient(135deg, #111 33%, #FFB300 33% 66%, #8E24AA 66%)",
    },
    {
        "id": "silk_tri_orange_blue_green",
        "name": "Orange Blue Green",
        "hex": "#00897B",
        "colors": ["#FF6D00", "#0288D1", "#2E7D32"],
        "gradient": "linear-gradient(135deg, #FF6D00 33%, #0288D1 33% 66%, #2E7D32 66%)",
    },
    {
        "id": "silk_tri_red_yellow_green",
        "name": "Red Yellow Green",
        "hex": "#FBC02D",
        "colors": ["#D32F2F", "#FDD835", "#388E3C"],
        "gradient": "linear-gradient(135deg, #D32F2F 33%, #FDD835 33% 66%, #388E3C 66%)",
    },
    {
        "id": "silk_tri_red_yellow_blue",
        "name": "Red Yellow Blue",
        "hex": "#D32F2F",
        "colors": ["#D32F2F", "#FDD835", "#1976D2"],
        "gradient": "linear-gradient(135deg, #D32F2F 33%, #FDD835 33% 66%, #1976D2 66%)",
    },
    {
        "id": "silk_tri_blue_green_purple",
        "name": "Blue Green Purple",
        "hex": "#512DA8",
        "colors": ["#1976D2", "#388E3C", "#7B1FA2"],
        "gradient": "linear-gradient(135deg, #1976D2 33%, #388E3C 33% 66%, #7B1FA2 66%)",
    },
]

GALAXY_COLORS = [
    {
        "id": "galaxy_starlit_flow",
        "name": "Starlit Flow",
        "hex": "#1A2A44",
        "gradient": "radial-gradient(circle, #2A4365, #0F172A)",
    },
    {
        "id": "galaxy_green",
        "name": "Galaxy Green",
        "hex": "#143D28",
        "gradient": "radial-gradient(circle, #1F5F3E, #092013)",
    },
    {
        "id": "galaxy_stardust_purple",
        "name": "Stardust Purple",
        "hex": "#381E47",
        "gradient": "radial-gradient(circle, #552B6F, #220F2E)",
    },
    {
        "id": "galaxy_star_brown",
        "name": "Star Brown",
        "hex": "#42281D",
        "gradient": "radial-gradient(circle, #5F3826, #2B1810)",
    },
]

RAINBOW_COLORS = [
    {
        "id": "rainbow_01",
        "name": "Rainbow 01",
        "hex": "#E91E63",
        "colors": ["#E91E63", "#9C27B0", "#2196F3", "#4CAF50", "#FFEB3B", "#FF9800"],
        "gradient": "linear-gradient(90deg, #E91E63, #9C27B0, #2196F3, #4CAF50, #FFEB3B, #FF9800)",
    },
    {
        "id": "rainbow_02",
        "name": "Rainbow 02",
        "hex": "#00BCD4",
        "colors": ["#00BCD4", "#8BC34A", "#CDDC39", "#FFC107", "#FF5722"],
        "gradient": "linear-gradient(90deg, #00BCD4, #8BC34A, #CDDC39, #FFC107, #FF5722)",
    },
    {
        "id": "rainbow_03",
        "name": "Rainbow 03",
        "hex": "#AB47BC",
        "colors": ["#7E57C2", "#42A5F5", "#26A69A", "#D4E157", "#FFA726"],
        "gradient": "linear-gradient(90deg, #7E57C2, #42A5F5, #26A69A, #D4E157, #FFA726)",
    },
    {
        "id": "rainbow_04",
        "name": "Rainbow 04",
        "hex": "#26C6DA",
        "colors": ["#26C6DA", "#80CBC4", "#B2DFDB", "#FFE082", "#FFAB91"],
        "gradient": "linear-gradient(90deg, #26C6DA, #80CBC4, #B2DFDB, #FFE082, #FFAB91)",
    },
]


def _subtype(
    *,
    sid: str,
    name: str,
    label: str,
    slicer_type: str,
    price_per_kg: float,
    density: float,
    colors: list[dict],
    category: str,
    group: str,
    desc: str,
    hdt: str,
    tensile: str,
    uv: str,
    roughness: float,
    metalness: float,
    tier: str,
    aliases: list[str] | None = None,
    badge: str | None = None,
    nozzle_temp: int = 215,
    bed_temp: int = 55,
) -> dict:
    return {
        "id": sid,
        "name": name,
        "label": label,
        "slicerType": slicer_type,
        "pricePerKg": price_per_kg,
        "ratePerG": _kg_to_g(price_per_kg),
        "density": density,
        "pricePerCm3": _kg_to_cm3(price_per_kg, density),
        "category": category,
        "group": group,
        "desc": desc,
        "hdt": hdt,
        "tensileStrength": tensile,
        "uvResistance": uv,
        "roughness": roughness,
        "metalness": metalness,
        "tier": tier,
        "aliases": aliases or [],
        "badge": badge,
        "nozzleTemp": nozzle_temp,
        "bedTemp": bed_temp,
        "colors": colors,
    }


FAMILIES: list[dict] = [
    {
        "id": "PLA",
        "name": "PLA",
        "group": "standard",
        "pickerTitle": "Wybierz rodzaj PLA",
        "desc": "Najwyższa precyzja wymiarowa i gładkość detali. Idealny do prototypów, obudów i figurek.",
        "hdt": "55°C",
        "tensileStrength": "Wysoka",
        "uvResistance": "Średnia",
        "subtypes": [
            _subtype(
                sid="PLA_STANDARD",
                name="PLA",
                label="Standard",
                slicer_type="PLA",
                price_per_kg=45,
                density=1.24,
                colors=_palette(PLA_STANDARD_COLORS, "pla"),
                category="PLA",
                group="standard",
                desc="Sunlu PLA — standardowy filament do prototypów i detali.",
                hdt="55°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.40,
                metalness=0.05,
                tier="standard",
                aliases=["pla", "PLA", "PLA_STANDARD", "PLA Tough", "PLA Matte", "PLA Basic"],
                badge="Najpopularniejszy",
            ),
            _subtype(
                sid="PLA_WOOD",
                name="PLA",
                label="Wood",
                slicer_type="PLA Wood",
                price_per_kg=65,
                density=1.25,
                colors=WOOD_COLORS,
                category="PLA Wood",
                group="standard",
                desc="PLA z domieszką pyłu drzewnego.",
                hdt="55°C",
                tensile="Średnia",
                uv="Średnia",
                roughness=0.94,
                metalness=0.0,
                tier="premium",
                aliases=["pla wood", "WOOD", "PLA_WOOD"],
                nozzle_temp=205,
                bed_temp=45,
            ),
            _subtype(
                sid="PLA_SILK_DUAL",
                name="PLA",
                label="Silk dual color",
                slicer_type="PLA Silk Dual",
                price_per_kg=65,
                density=1.23,
                colors=SILK_DUAL_COLORS,
                category="Silk Dual-Color",
                group="standard",
                desc="Jedwabiste PLA dwukolorowe.",
                hdt="55°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.28,
                metalness=0.15,
                tier="premium",
                aliases=["pla silk dual", "dual", "PLA_SILK_DUAL", "PLA Silk"],
                nozzle_temp=220,
            ),
            _subtype(
                sid="PLA_TRI",
                name="PLA",
                label="Tri color",
                slicer_type="PLA Silk Tri",
                price_per_kg=65,
                density=1.23,
                colors=SILK_TRI_COLORS,
                category="Silk Tri-Color",
                group="standard",
                desc="Jedwabiste PLA trójkolorowe.",
                hdt="55°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.28,
                metalness=0.15,
                tier="premium",
                aliases=["pla tri", "tri", "PLA_TRI", "PLA_SILK_TRI"],
                nozzle_temp=220,
            ),
            _subtype(
                sid="PLA_GALAXY",
                name="PLA",
                label="Galaxy",
                slicer_type="PLA Galaxy",
                price_per_kg=75,
                density=1.22,
                colors=GALAXY_COLORS,
                category="PLA Galaxy",
                group="standard",
                desc="PLA z efektem galaktyki / brokatu.",
                hdt="55°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.35,
                metalness=0.12,
                tier="premium",
                aliases=["pla galaxy", "galaxy", "PLA_GALAXY"],
            ),
            _subtype(
                sid="PLA_RAINBOW",
                name="PLA",
                label="Rainbow",
                slicer_type="PLA Rainbow",
                price_per_kg=75,
                density=1.21,
                colors=RAINBOW_COLORS,
                category="PLA Rainbow",
                group="standard",
                desc="PLA z gradientem tęczowym.",
                hdt="55°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.28,
                metalness=0.10,
                tier="premium",
                aliases=["pla rainbow", "rainbow", "PLA_RAINBOW"],
                nozzle_temp=210,
            ),
        ],
    },
    {
        "id": "PETG",
        "name": "PETG",
        "group": "standard",
        "pickerTitle": "Wybierz rodzaj PETG",
        "desc": "Trwały, wodoodporny materiał o podwyższonej odporności termicznej i chemicznej.",
        "hdt": "75°C",
        "tensileStrength": "Bardzo wysoka",
        "uvResistance": "Dobra",
        "subtypes": [
            _subtype(
                sid="PETG",
                name="PETG",
                label="Standard",
                slicer_type="PETG",
                price_per_kg=60,
                density=1.27,
                colors=_palette(PETG_COLORS, "petg"),
                category="single",
                group="standard",
                desc="PETG standardowy do części użytkowych.",
                hdt="75°C",
                tensile="Bardzo wysoka",
                uv="Dobra",
                roughness=0.30,
                metalness=0.10,
                tier="standard",
                aliases=["petg", "PETG", "PETG_TOUGH"],
                badge="Użytkowy",
                nozzle_temp=235,
                bed_temp=75,
            ),
            _subtype(
                sid="PETG_CF",
                name="PETG",
                label="Carbon fiber",
                slicer_type="PETG-CF",
                price_per_kg=110,
                density=1.30,
                colors=[_color("black", "petg_cf")],
                category="single",
                group="composite",
                desc="PETG wzmocniony włóknem węglowym.",
                hdt="78°C",
                tensile="Ekstremalna sztywność",
                uv="Dobra",
                roughness=0.85,
                metalness=0.12,
                tier="premium",
                aliases=["petg cf", "PETG-CF", "PETG carbon"],
                badge="Kompozyt Carbon",
                nozzle_temp=250,
                bed_temp=80,
            ),
            _subtype(
                sid="PETG_FR",
                name="PETG",
                label="FR V0",
                slicer_type="PETG FR",
                price_per_kg=234,
                density=1.29,
                colors=_palette(["natural", "black", "gray"], "petg_fr"),
                category="single",
                group="tech",
                desc="PETG trudnopalny UL94 V-0.",
                hdt="78°C",
                tensile="Bardzo wysoka",
                uv="Dobra",
                roughness=0.40,
                metalness=0.08,
                tier="premium",
                aliases=["petg_fr", "PETG FR", "PETG FR V0"],
                badge="UL94 V-0",
                nozzle_temp=245,
                bed_temp=80,
            ),
        ],
    },
    {
        "id": "ABS",
        "name": "ABS",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj ABS",
        "desc": "Przemysłowy standard o wysokiej sztywności, twardości i odporności na uderzenia.",
        "hdt": "90°C",
        "tensileStrength": "Wysoka udarność",
        "uvResistance": "Średnia",
        "subtypes": [
            _subtype(
                sid="ABS",
                name="ABS",
                label="Standard",
                slicer_type="ABS",
                price_per_kg=68,
                density=1.05,
                colors=_palette(ABS_COLORS, "abs"),
                category="single",
                group="tech",
                desc="ABS przemysłowy.",
                hdt="90°C",
                tensile="Wysoka udarność",
                uv="Średnia",
                roughness=0.50,
                metalness=0.05,
                tier="standard",
                aliases=["abs", "ABS", "ABS_INDUSTRY"],
                badge="Odporny termicznie",
                nozzle_temp=245,
                bed_temp=100,
            ),
            _subtype(
                sid="ABS_GF",
                name="ABS",
                label="GF",
                slicer_type="ABS GF",
                price_per_kg=90,
                density=1.15,
                colors=[_color("natural", "abs_gf")],
                category="single",
                group="tech",
                desc="ABS wzmocniony włóknem szklanym.",
                hdt="95°C",
                tensile="Wysoka sztywność",
                uv="Średnia",
                roughness=0.70,
                metalness=0.05,
                tier="premium",
                aliases=["abs gf", "ABS-GF", "ABS_GF"],
                nozzle_temp=250,
                bed_temp=100,
            ),
            _subtype(
                sid="ABS_FR",
                name="ABS",
                label="FR",
                slicer_type="ABS FR",
                price_per_kg=158,
                density=1.16,
                colors=[_color("black", "abs_fr")],
                category="single",
                group="tech",
                desc="ABS trudnopalny.",
                hdt="95°C",
                tensile="Wysoka",
                uv="Średnia",
                roughness=0.55,
                metalness=0.05,
                tier="premium",
                aliases=["abs fr", "ABS-FR", "ABS_FR"],
                nozzle_temp=250,
                bed_temp=100,
            ),
        ],
    },
    {
        "id": "ASA",
        "name": "ASA",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj ASA",
        "desc": "Polimer do ekspozycji na zewnątrz — odporny na UV, deszcz i mróz.",
        "hdt": "95°C",
        "tensileStrength": "Bardzo wysoka",
        "uvResistance": "Maksymalna (Outdoor)",
        "subtypes": [
            _subtype(
                sid="ASA",
                name="ASA",
                label="Standard",
                slicer_type="ASA",
                price_per_kg=101,
                density=1.07,
                colors=_palette(["grey", "klein blue", "green", "white", "black"], "asa"),
                category="single",
                group="tech",
                desc="ASA outdoor / UV.",
                hdt="95°C",
                tensile="Bardzo wysoka",
                uv="Maksymalna (Outdoor)",
                roughness=0.70,
                metalness=0.05,
                tier="premium",
                aliases=["asa", "ASA", "ASA_UV"],
                badge="Odporny UV",
                nozzle_temp=250,
                bed_temp=100,
            ),
        ],
    },
    {
        "id": "TPU",
        "name": "TPU 95A",
        "group": "flex",
        "pickerTitle": "Wybierz rodzaj TPU",
        "desc": "Elastomer 95A Shore — tłumi drgania i wraca do kształtu.",
        "hdt": "60°C",
        "tensileStrength": "Sprężysta guma",
        "uvResistance": "Bardzo dobra",
        "subtypes": [
            _subtype(
                sid="TPU_95A",
                name="TPU 95A",
                label="95A",
                slicer_type="TPU 95A",
                price_per_kg=105,
                density=1.21,
                colors=_palette(
                    ["sunny orange", "azure", "black", "white", "grey", "green"], "tpu"
                ),
                category="single",
                group="flex",
                desc="TPU 95A / guma.",
                hdt="60°C",
                tensile="Sprężysta guma",
                uv="Bardzo dobra",
                roughness=0.60,
                metalness=0.0,
                tier="premium",
                aliases=["tpu", "tpu_95a", "TPU 95A", "TPU_FLEX", "FLEX"],
                badge="Elastyczna guma",
                nozzle_temp=220,
                bed_temp=50,
            ),
        ],
    },
    {
        "id": "PA",
        "name": "PA",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj PA",
        "desc": "Poliamidy konstrukcyjne — od łatwego Easy PA po kompozyty CF.",
        "hdt": "120°C",
        "tensileStrength": "Bardzo wysoka",
        "uvResistance": "Bardzo dobra",
        "subtypes": [
            _subtype(
                sid="PA12_CF",
                name="PA",
                label="PA 12-CF",
                slicer_type="PA12 CF",
                price_per_kg=359,
                density=1.15,
                colors=[_color("black", "pa12_cf")],
                category="single",
                group="composite",
                desc="Nylon PA12 z włóknem węglowym.",
                hdt="155°C",
                tensile="Ekstremalna sztywność",
                uv="Bardzo dobra",
                roughness=0.85,
                metalness=0.15,
                tier="premium",
                aliases=["pa12_cf", "PA12 CF", "PA12_CF15", "PA-CF", "PA 12-CF"],
                badge="Kompozyt Carbon",
                nozzle_temp=280,
                bed_temp=100,
            ),
            _subtype(
                sid="PA6_CF",
                name="PA",
                label="PA 6 CF",
                slicer_type="PA6 CF",
                price_per_kg=225,
                density=1.20,
                colors=[_color("black", "pa6_cf")],
                category="single",
                group="composite",
                desc="Nylon PA6 z włóknem węglowym.",
                hdt="150°C",
                tensile="Ekstremalna sztywność",
                uv="Bardzo dobra",
                roughness=0.85,
                metalness=0.12,
                tier="premium",
                aliases=["pa6 cf", "PA6-CF", "PA 6 CF", "PA6_CF"],
                nozzle_temp=280,
                bed_temp=100,
            ),
            _subtype(
                sid="EASY_PA",
                name="PA",
                label="Easy PA",
                slicer_type="Easy PA",
                price_per_kg=110,
                density=1.14,
                colors=_palette(["natural", "black"], "easy_pa"),
                category="single",
                group="tech",
                desc="Łatwiejszy w druku nylon (Easy PA).",
                hdt="120°C",
                tensile="Wysoka",
                uv="Dobra",
                roughness=0.55,
                metalness=0.05,
                tier="premium",
                aliases=["easy pa", "EASY_PA", "EasyPA"],
                nozzle_temp=260,
                bed_temp=80,
            ),
        ],
    },
    {
        "id": "PP",
        "name": "PP",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj PP",
        "desc": "Polipropylen — niska higroskopijność i odporność chemiczna.",
        "hdt": "85°C",
        "tensileStrength": "Wysoka sprężystość",
        "uvResistance": "Dobra",
        "subtypes": [
            _subtype(
                sid="PP",
                name="PP",
                label="Standard",
                slicer_type="PP",
                price_per_kg=170,
                density=0.90,
                colors=[_color("natural", "pp")],
                category="single",
                group="tech",
                desc="PP naturalny.",
                hdt="85°C",
                tensile="Wysoka sprężystość",
                uv="Dobra",
                roughness=0.60,
                metalness=0.0,
                tier="premium",
                aliases=["pp", "PP", "PP_TECH"],
                nozzle_temp=225,
                bed_temp=85,
            ),
        ],
    },
    {
        "id": "PC",
        "name": "PC",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj PC",
        "desc": "Poliwęglan — udarność i praca w podwyższonej temperaturze.",
        "hdt": "115°C",
        "tensileStrength": "Ekstremalna",
        "uvResistance": "Bardzo dobra",
        "subtypes": [
            _subtype(
                sid="PC",
                name="PC",
                label="Standard",
                slicer_type="PC",
                price_per_kg=158,
                density=1.20,
                colors=[_color("natural", "pc")],
                category="single",
                group="tech",
                desc="PC naturalny.",
                hdt="115°C",
                tensile="Ekstremalna",
                uv="Bardzo dobra",
                roughness=0.35,
                metalness=0.08,
                tier="premium",
                aliases=["pc", "PC", "polycarbonate"],
                nozzle_temp=270,
                bed_temp=110,
            ),
        ],
    },
    {
        "id": "PCTG",
        "name": "PCTG",
        "group": "tech",
        "pickerTitle": "Wybierz rodzaj PCTG",
        "desc": "Kopoliester o wysokiej udarności — odporny na pękanie dynamiczne.",
        "hdt": "76°C",
        "tensileStrength": "Ekstremalna",
        "uvResistance": "Dobra",
        "subtypes": [
            _subtype(
                sid="PCTG",
                name="PCTG",
                label="Standard",
                slicer_type="PCTG",
                price_per_kg=150,
                density=1.23,
                colors=[
                    _color("transparent", "pctg"),
                    _color("black", "pctg"),
                    _color("orange", "pctg"),
                    _color("blue", "pctg"),
                    _color("graphite", "pctg"),
                    _color("white", "pctg"),
                ],
                category="single",
                group="tech",
                desc="PCTG — transparent, czarny, orange, blue, grafit, white.",
                hdt="76°C",
                tensile="Ekstremalna",
                uv="Dobra",
                roughness=0.35,
                metalness=0.08,
                tier="premium",
                aliases=["pctg", "PCTG", "PCTG_PRO"],
                badge="Wysoka udarność",
                nozzle_temp=240,
                bed_temp=75,
            ),
        ],
    },
]


def iter_subtypes():
    for family in FAMILIES:
        for subtype in family["subtypes"]:
            yield family, subtype


def studio_materials() -> list[dict]:
    """Płaska lista podtypów do wyceniarki (id = PLA_STANDARD, PETG, …)."""
    materials = []
    for family, subtype in iter_subtypes():
        display = (
            family["name"]
            if subtype["label"] in ("Standard", "95A")
            else f"{family['name']} · {subtype['label']}"
        )
        if family["id"] == "TPU":
            display = "TPU 95A"
        materials.append(
            {
                "id": subtype["id"],
                "familyId": family["id"],
                "familyName": family["name"],
                "subtypeLabel": subtype["label"],
                "name": display,
                "aliases": list(subtype.get("aliases") or []) + [subtype["id"], family["id"]],
                "group": subtype["group"],
                "badge": subtype.get("badge"),
                "slicerType": subtype["slicerType"],
                "desc": subtype["desc"] or family.get("desc"),
                "pricePerKg": subtype["pricePerKg"],
                "ratePerG": subtype["ratePerG"],
                "density": subtype["density"],
                "hdt": subtype["hdt"] or family.get("hdt"),
                "tensileStrength": subtype["tensileStrength"] or family.get("tensileStrength"),
                "uvResistance": subtype["uvResistance"] or family.get("uvResistance"),
                "colors": subtype["colors"],
                "hasSubtypes": len(family["subtypes"]) > 1,
            }
        )
    return materials


def seed_filaments() -> list[dict]:
    """Wiersze tabeli filaments (jedna pozycja = kolor)."""
    rows = []
    for family, subtype in iter_subtypes():
        for color in subtype["colors"]:
            extra = color.get("colors")
            rows.append(
                {
                    "id": color["id"][:50],
                    "name": color["name"][:100],
                    "tier": subtype["tier"],
                    "type": family["id"][:50],
                    "category": subtype["category"][:50],
                    "family": family["id"],
                    "subtype": subtype["id"],
                    "hex": color.get("hex"),
                    "colors": extra if extra else None,
                    "price_per_cm3": subtype["pricePerCm3"],
                    "price_per_kg": subtype["pricePerKg"],
                    "density": subtype["density"],
                    "roughness": subtype["roughness"],
                    "metalness": subtype["metalness"],
                    "in_stock": True,
                }
            )
    return rows


def catalog_payload() -> dict:
    return {
        "families": deepcopy(FAMILIES),
        "materials": studio_materials(),
    }


def write_catalog_json() -> tuple[Path, Path]:
    payload = catalog_payload()
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    CATALOG_JSON.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_JSON.write_text(text, encoding="utf-8")
    if FRONTEND_CATALOG_JSON.parent.exists():
        FRONTEND_CATALOG_JSON.write_text(text, encoding="utf-8")
    return CATALOG_JSON, FRONTEND_CATALOG_JSON


def _normalize(name: str) -> str:
    return str(name or "").upper().replace("_", " ").replace("-", " ").strip()


def get_subtype_by_id(material_id: str) -> dict | None:
    needle = str(material_id or "").strip()
    if not needle:
        return None
    for _family, subtype in iter_subtypes():
        if subtype["id"] == needle:
            return subtype
        aliases = [str(a) for a in subtype.get("aliases") or []]
        if needle in aliases or needle.lower() in {a.lower() for a in aliases}:
            return subtype
    return None


def get_material_rate_per_g(material_name: str) -> float:
    """Stawka PLN/g z ceny zł/kg wybranego filamentu (najdłuższy dopasowany klucz)."""
    hay = _normalize(material_name)
    ranked = []
    for family, subtype in iter_subtypes():
        keys = [
            subtype["id"],
            subtype["slicerType"],
            subtype["label"],
            family["id"],
            family["name"],
            *subtype.get("aliases", []),
        ]
        for key in keys:
            clean = _normalize(key)
            if clean and clean in hay:
                ranked.append((len(clean), subtype["ratePerG"]))
    if ranked:
        ranked.sort(key=lambda x: x[0], reverse=True)
        return ranked[0][1]
    return _kg_to_g(45)


def get_material_density(material_name: str) -> float:
    hay = _normalize(material_name)
    ranked = []
    for family, subtype in iter_subtypes():
        for key in (subtype["id"], subtype["slicerType"], family["id"], *subtype.get("aliases", [])):
            clean = _normalize(key)
            if clean and clean in hay:
                ranked.append((len(clean), subtype["density"]))
    if ranked:
        ranked.sort(key=lambda x: x[0], reverse=True)
        return ranked[0][1]
    return 1.24


PUBLIC_FILAMENT_FIELDS = (
    "id",
    "name",
    "tier",
    "type",
    "category",
    "family",
    "subtype",
    "hex",
    "colors",
    "in_stock",
    "roughness",
    "metalness",
)


def public_filament_row(item: dict) -> dict:
    """Katalog publiczny bez zł/kg i zł/cm³."""
    return {key: item.get(key) for key in PUBLIC_FILAMENT_FIELDS}


if __name__ == "__main__":
    backend_path, frontend_path = write_catalog_json()
    rows = seed_filaments()
    print(f"wrote {backend_path}")
    print(f"wrote {frontend_path}")
    print(f"families={len(FAMILIES)} subtypes={len(studio_materials())} colors={len(rows)}")
    print(f"PLA rate={get_material_rate_per_g('PLA')} PA12={get_material_rate_per_g('PA12 CF')}")
