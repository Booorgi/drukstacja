"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy pakiet projektu .3MF w natywnej strukturze MakerLab / Bambu Studio (A1 / AMS)
odtworzonej w 100% ze sprawdzonego pliku referencyjnego Keychain Draft.3mf.

STRUKTURA ARCHIWUM .3MF (1:1 z Keychain Draft.3mf):
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── 3D/
│   ├── 3dmodel.model            (tylko assembly id=7607 z <components p:path>, bez <mesh>)
│   ├── _rels/
│   │   └── 3dmodel.model.rels   (relacja OPC do /3D/Objects/object-7607.model)
│   └── Objects/
│       └── object-7607.model    (siatki części: <object id="10001">…<mesh>)
└── Metadata/
    ├── model_settings.config    (object id=7607, part id -> extruder)
    ├── project_settings.config  (filament_colour, temperatury SUNLU, profil Bambu A1)
    └── plate_1.png
"""
import os
import re
import json
import zipfile
import datetime
import struct
import zlib
import uuid
from pathlib import Path
import trimesh
import numpy as np

try:
    from slicer import convert_step_to_stl
except ImportError:
    convert_step_to_stl = None


def sanitize_filename(name: str) -> str:
    """Oczyszcza nazwę pliku z niedozwolonych znaków."""
    clean = re.sub(r"[^\w\-.]", "_", name)
    clean = re.sub(r"_+", "_", clean)
    return clean.strip("_")


def xml_escape(val: str) -> str:
    """Escapuje znaki specjalne dla atrybutów i wartości XML."""
    return (
        str(val)
        .replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def format_hex_6(hex_str: str) -> str:
    """Formatuje kod koloru HEX do standardu #RRGGBB."""
    if not hex_str:
        return "#000000"
    clean = hex_str.strip().lstrip("#").upper()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) >= 6:
        return f"#{clean[:6]}"
    return "#000000"


def format_hex_8(hex_str: str) -> str:
    """Formatuje kod koloru HEX do standardu #RRGGBBAA wymaganego przez specyfikację 3MF m:color."""
    if not hex_str:
        return "#000000FF"
    clean = hex_str.strip().lstrip("#").upper()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) == 6:
        return f"#{clean}FF"
    elif len(clean) >= 8:
        return f"#{clean[:8]}"
    return "#000000FF"


def create_dummy_png(width: int = 200, height: int = 200, color: tuple = (38, 42, 51)) -> bytes:
    """Tworzy poprawny binarnie plik PNG miniatury stołu bez zewnętrznych bibliotek."""
    png_sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_crc = struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data) & 0xffffffff)
    ihdr_chunk = struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + ihdr_crc

    raw_row = b"\x00" + bytes(color) * width
    raw_data = raw_row * height
    compressed_data = zlib.compress(raw_data)
    idat_crc = struct.pack(">I", zlib.crc32(b"IDAT" + compressed_data) & 0xffffffff)
    idat_chunk = struct.pack(">I", len(compressed_data)) + b"IDAT" + compressed_data + idat_crc

    iend_crc = struct.pack(">I", zlib.crc32(b"IEND") & 0xffffffff)
    iend_chunk = struct.pack(">I", 0) + b"IEND" + iend_crc

    return png_sig + ihdr_chunk + idat_chunk + iend_chunk


def _mesh_to_xml(mesh, indent="     "):
    """Konwertuje trimesh.Trimesh do ciągów XML vertices i triangles."""
    if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0:
        return "", ""
    vert_lines = [
        '%s<vertex x="%.4f" y="%.4f" z="%.4f"/>' % (indent, float(v[0]), float(v[1]), float(v[2]))
        for v in mesh.vertices
    ]
    tri_lines = [
        '%s<triangle v1="%d" v2="%d" v3="%d"/>' % (indent, int(f[0]), int(f[1]), int(f[2]))
        for f in mesh.faces
    ]
    return "\n".join(vert_lines), "\n".join(tri_lines)



SUNLU_FILAMENT_CATALOG = {
    # --- SUNLU PLA (Standard & Transparent) ---
    "#E8D8C8": {"name": "SUNLU PLA Beige", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#F3EFE6": {"name": "SUNLU PLA Bone White", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FFFFFF": {"name": "SUNLU PLA Ceramic White", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#5C3A21": {"name": "SUNLU PLA Coffee Brown", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#381E11": {"name": "SUNLU PLA Chocolate", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#00BCDB": {"name": "SUNLU PLA Cyan", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#8E9297": {"name": "SUNLU PLA Grey", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#0E8A37": {"name": "SUNLU PLA Green", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#78C850": {"name": "SUNLU PLA Light Green", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#111215": {"name": "SUNLU PLA Midnight Black", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#222222": {"name": "SUNLU PLA Black", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#6E3725": {"name": "SUNLU PLA Roasted Chestnut", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#002FA7": {"name": "SUNLU PLA Klein Blue", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FFF033": {"name": "SUNLU PLA Lemon Yellow", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FFCD00": {"name": "SUNLU PLA Yellow", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#D4AF37": {"name": "SUNLU PLA Light Gold", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#C5C6C7": {"name": "SUNLU PLA Silver", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FFB3C6": {"name": "SUNLU PLA Sakura Pink", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FF6B00": {"name": "SUNLU PLA Sunny Orange", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#56CCF2": {"name": "SUNLU PLA Sky Blue", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#D81E06": {"name": "SUNLU PLA Red", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#9B72CF": {"name": "SUNLU PLA Lavender Purple", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#88D49E": {"name": "SUNLU PLA Mint Green", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#ECEFF1": {"name": "SUNLU PLA Transparent", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#556B2F": {"name": "SUNLU PLA Olive Green", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#C2185B": {"name": "SUNLU PLA Magenta", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#FFD000": {"name": "SUNLU PLA Vivid Yellow", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#8F6843": {"name": "SUNLU PLA Oak", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.24},
    "#E53935": {"name": "SUNLU PLA Transparent Red", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#FB8C00": {"name": "SUNLU PLA Transparent Orange", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#43A047": {"name": "SUNLU PLA Transparent Green", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#FDD835": {"name": "SUNLU PLA Transparent Yellow", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#8E24AA": {"name": "SUNLU PLA Transparent Purple", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},

    # --- PLA Wood ---
    "#C49A6C": {"name": "SUNLU PLA Wood Maple", "type": "PLA", "nozzleTemp": 205, "bedTemp": 45, "density": 1.25},
    "#A87C4F": {"name": "SUNLU PLA Wood Natural", "type": "PLA", "nozzleTemp": 205, "bedTemp": 45, "density": 1.25},
    "#533826": {"name": "SUNLU PLA Wood Walnut", "type": "PLA", "nozzleTemp": 205, "bedTemp": 45, "density": 1.25},
    "#7A2F21": {"name": "SUNLU PLA Wood Cherry", "type": "PLA", "nozzleTemp": 205, "bedTemp": 45, "density": 1.25},

    # --- Silk Dual Color ---
    "#1A237E": {"name": "SUNLU Silk Dual Black Blue", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#4A148C": {"name": "SUNLU Silk Dual Black Purple", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#1B5E20": {"name": "SUNLU Silk Dual Black Green", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#757575": {"name": "SUNLU Silk Dual Black White", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#00897B": {"name": "SUNLU Silk Dual Blue Green", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#6A1B9A": {"name": "SUNLU Silk Dual Green Purple", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#880E4F": {"name": "SUNLU Silk Dual Red Blue", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#B71C1C": {"name": "SUNLU Silk Dual Red Gold", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#F48FB1": {"name": "SUNLU Silk Dual Pink Gold", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},

    # --- Silk Tri Color ---
    "#6A1B9A": {"name": "SUNLU Silk Tri Black Gold Purple", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#FBC02D": {"name": "SUNLU Silk Tri Red Yellow Green", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#D32F2F": {"name": "SUNLU Silk Tri Red Yellow Blue", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},
    "#512DA8": {"name": "SUNLU Silk Tri Blue Green Purple", "type": "PLA-Silk", "nozzleTemp": 220, "bedTemp": 55, "density": 1.23},

    # --- PLA Galaxy ---
    "#1A2A44": {"name": "SUNLU PLA Galaxy Starlit Flow", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.22},
    "#143D28": {"name": "SUNLU PLA Galaxy Green", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.22},
    "#381E47": {"name": "SUNLU PLA Galaxy Stardust Purple", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.22},
    "#42281D": {"name": "SUNLU PLA Galaxy Star Brown", "type": "PLA", "nozzleTemp": 215, "bedTemp": 55, "density": 1.22},

    # --- PLA Rainbow ---
    "#E91E63": {"name": "SUNLU PLA Rainbow 01", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#00BCD4": {"name": "SUNLU PLA Rainbow 02", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#AB47BC": {"name": "SUNLU PLA Rainbow 03", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
    "#26C6DA": {"name": "SUNLU PLA Rainbow 04", "type": "PLA", "nozzleTemp": 210, "bedTemp": 55, "density": 1.21},
}


def resolve_filament_profile(color_hex: str, user_filament: dict = None, default_mat: str = "PLA") -> dict:
    """
    Zwraca spójny profil filamentu z temperaturami, gęstością i typem dla slicera Bambu Studio.
    """
    c6 = format_hex_6(color_hex).upper()
    cat_entry = SUNLU_FILAMENT_CATALOG.get(c6)

    # 1. Sprawdź czy podano filament bezpośrednio w danych części
    if user_filament and isinstance(user_filament, dict):
        f_type = user_filament.get("type") or (cat_entry["type"] if cat_entry else default_mat)
        f_name = user_filament.get("name") or (cat_entry["name"] if cat_entry else f"SUNLU PLA {c6}")
        nozzle = (
            user_filament.get("nozzleTemp")
            or user_filament.get("nozzle_temperature")
            or (cat_entry["nozzleTemp"] if cat_entry else 215)
        )
        bed = (
            user_filament.get("bedTemp")
            or user_filament.get("bed_temperature")
            or (cat_entry["bedTemp"] if cat_entry else 55)
        )
        density = (
            user_filament.get("density")
            or (cat_entry["density"] if cat_entry else 1.24)
        )
        try:
            nozzle_int = int(nozzle)
        except Exception:
            nozzle_int = 215
        try:
            bed_int = int(bed)
        except Exception:
            bed_int = 55
        try:
            density_flt = float(density)
        except Exception:
            density_flt = 1.24

        return {
            "color": c6,
            "type": str(f_type),
            "name": str(f_name),
            "nozzle_temperature": nozzle_int,
            "bed_temperature": bed_int,
            "density": density_flt,
        }

    # 2. Katalog SUNLU
    if cat_entry:
        return {
            "color": c6,
            "type": cat_entry["type"],
            "name": cat_entry["name"],
            "nozzle_temperature": cat_entry["nozzleTemp"],
            "bed_temperature": cat_entry["bedTemp"],
            "density": cat_entry["density"],
        }

    # 3. Domyślny profil
    return {
        "color": c6,
        "type": default_mat,
        "name": f"SUNLU PLA {c6}",
        "nozzle_temperature": 215,
        "bed_temperature": 55,
        "density": 1.24,
    }


def get_bambu_process_preset(layer_height: float) -> str:
    """Zwraca oficjalną nazwę profilu procesu Bambu Studio dla danej wysokości warstwy."""
    if abs(layer_height - 0.08) < 0.01:
        return "0.08mm High Quality @BBL A1"
    elif abs(layer_height - 0.12) < 0.01:
        return "0.12mm High Quality @BBL A1"
    elif abs(layer_height - 0.16) < 0.01:
        return "0.16mm Optimal @BBL A1"
    elif abs(layer_height - 0.20) < 0.01:
        return "0.20mm Standard @BBL A1"
    elif abs(layer_height - 0.24) < 0.01:
        return "0.24mm Draft @BBL A1"
    elif abs(layer_height - 0.28) < 0.01:
        return "0.28mm Extra Draft @BBL A1"
    return f"{layer_height:.2f}mm Standard @BBL A1"


def generate_production_3mf(
    model_path: str = None,
    order_metadata: dict = None,
    print_settings: dict = None,
    output_path: str = None,
    parts: list = None,
) -> str:
    """
    Generuje pakiet produkcyjny .3MF zgodny z architekturą MakerLab / Bambu Studio
    odtworzoną bezpośrednio z referencyjnego pliku Keychain Draft.3mf.

    Architektura:
    1. 3D/3dmodel.model: wyłącznie obiekt montażowy id="7607" z <component p:path=...>.
       W <build> tylko <item objectid="7607"/>. Żadnej siatki w tym pliku.
    2. 3D/Objects/object-7607.model: geometria każdej części jako <object id="10001+idx">.
    3. Metadata/model_settings.config: <object id="7607"> i <part id="10001+idx"> z extruder.
    4. Metadata/project_settings.config: filament_colour + temperatury SUNLU, profil Bambu A1.
    """
    order_metadata = order_metadata or {}
    print_settings = print_settings or {}

    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(
        order_metadata.get("file_name")
        or (os.path.basename(model_path) if model_path else "keychain.3mf")
    )
    created_at = str(
        order_metadata.get("created_at") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

    # Parametry technologiczne druku
    def _parse_float(val, default):
        try:
            if isinstance(val, (int, float)):
                return float(val)
            nums = re.findall(r"[\d\.]+", str(val or ""))
            return float(nums[0]) if nums else default
        except Exception:
            return default

    layer_height = _parse_float(print_settings.get("layer_height"), 0.20)
    nozzle_size = _parse_float(print_settings.get("nozzle_size"), 0.40)
    infill_val = _parse_float(print_settings.get("infill"), 100.0)
    infill = int(infill_val)
    safe_infill = min(max(infill, 5), 100)

    material = str(print_settings.get("material") or "PLA")
    mat_upper = material.upper()
    if any(k in mat_upper for k in ["PETG", "PET-G", "PET"]):
        clean_mat = "PETG"
    elif "ABS" in mat_upper:
        clean_mat = "ABS"
    elif "ASA" in mat_upper:
        clean_mat = "ASA"
    elif any(k in mat_upper for k in ["TPU", "FLEX"]):
        clean_mat = "TPU"
    elif "PC" in mat_upper:
        clean_mat = "PC"
    elif any(k in mat_upper for k in ["CARBON", "CF"]):
        clean_mat = "PLA-CF"
    else:
        clean_mat = "PLA"

    color_hex = str(print_settings.get("color_hex") or "#222222")
    clean_title = sanitize_filename(Path(file_name).stem) or "Keychain"

    # ──────────────────────────────────────────────────────────────
    # 1. Wczytanie geometrii poszczególnych części
    # ──────────────────────────────────────────────────────────────
    valid_parts = []
    if parts and isinstance(parts, list) and len(parts) > 0:
        for idx, p in enumerate(parts):
            p_mesh = p.get("mesh")
            p_path = p.get("path")
            p_name = str(p.get("name") or ("Part_%d" % (idx + 1)))
            p_color = str(p.get("color_hex") or p.get("color") or color_hex)
            p_role = str(p.get("role") or "")

            if p_mesh is None and p_path and os.path.exists(p_path):
                try:
                    p_mesh = trimesh.load(p_path, force="mesh")
                except Exception as load_err:
                    print(f"[WARN] Nie udało się wczytać siatki części {p_name} z {p_path}: {load_err}")

            if p_mesh is not None:
                if isinstance(p_mesh, trimesh.Scene):
                    try:
                        p_mesh = p_mesh.to_geometry() if hasattr(p_mesh, "to_geometry") else p_mesh.dump(concatenate=True)
                    except Exception:
                        pass
                elif isinstance(p_mesh, list) and len(p_mesh) > 0:
                    try:
                        p_mesh = trimesh.util.concatenate(p_mesh)
                    except Exception:
                        pass

            if p_mesh is not None and hasattr(p_mesh, "vertices") and len(p_mesh.vertices) > 0:
                try:
                    if hasattr(p_mesh, "process"):
                        p_mesh.process(validate=True)
                    if hasattr(p_mesh, "remove_unreferenced_vertices"):
                        p_mesh.remove_unreferenced_vertices()
                    trimesh.repair.fix_normals(p_mesh)
                    trimesh.repair.fix_winding(p_mesh)
                except Exception:
                    pass

                valid_parts.append({
                    "name": p_name,
                    "color_hex": p_color,
                    "mesh": p_mesh,
                    "role": p_role,
                    "extruder": p.get("extruder") or p.get("slot") or p.get("ams_slot"),
                    "filament": p.get("filament") or p.get("filament_info"),
                })

    # Tryb pojedynczej bryły (jeśli brak listy parts)
    if not valid_parts:
        mesh = None
        if model_path and os.path.exists(model_path):
            ext = Path(model_path).suffix.lower()
            if ext in [".step", ".stp", ".iges", ".igs"] and convert_step_to_stl is not None:
                temp_stl = f"{model_path}_tmp_converted.stl"
                try:
                    convert_step_to_stl(model_path, temp_stl)
                    mesh = trimesh.load(temp_stl, force="mesh")
                except Exception as e:
                    print(f"[WARN] Konwersja STEP do STL nie powiodła się: {e}")
                finally:
                    if os.path.exists(temp_stl):
                        try:
                            os.remove(temp_stl)
                        except Exception:
                            pass

            if mesh is None:
                try:
                    mesh = trimesh.load(model_path, force="mesh")
                except Exception as load_err:
                    raise RuntimeError(f"Błąd odczytu pliku 3D ({model_path}): {load_err}")

        if mesh is None:
            raise ValueError("Brak geometrii 3D do spakowania do pakietu .3MF.")

        try:
            if hasattr(mesh, "process"):
                mesh.process(validate=True)
            if hasattr(mesh, "remove_unreferenced_vertices"):
                mesh.remove_unreferenced_vertices()
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fix_winding(mesh)
        except Exception:
            pass

        valid_parts.append({
            "name": clean_title,
            "color_hex": color_hex,
            "mesh": mesh,
            "role": "model",
            "extruder": None,
            "filament": print_settings.get("filament") if print_settings else None,
        })

    # ──────────────────────────────────────────────────────────────
    # 2. Mapowanie kolorów na ekstrudery (AMS)
    # ──────────────────────────────────────────────────────────────
    for p in valid_parts:
        p["color_6"] = format_hex_6(p["color_hex"])

    has_explicit_extruders = any(p.get("extruder") is not None for p in valid_parts)

    if has_explicit_extruders:
        for p in valid_parts:
            ext_val = None
            if p.get("extruder") is not None:
                try:
                    ext_val = int(p["extruder"])
                except Exception:
                    ext_val = None
            p["assigned_extruder"] = ext_val if ext_val and ext_val > 0 else 1

        # Uporządkowanie ekstruderów w spójną sekwencję 1..N bez dziur
        used_extruders = sorted(list(set(p["assigned_extruder"] for p in valid_parts)))
        ext_remap = {old_ext: new_idx + 1 for new_idx, old_ext in enumerate(used_extruders)}
        for p in valid_parts:
            p["assigned_extruder"] = ext_remap[p["assigned_extruder"]]

        num_filaments = len(used_extruders)
        filament_colours = ["#FFFFFF"] * num_filaments
        for p in valid_parts:
            ext_idx = p["assigned_extruder"] - 1
            if 0 <= ext_idx < num_filaments:
                filament_colours[ext_idx] = p["color_6"]
        unique_colors_6 = filament_colours
    else:
        unique_colors_6 = []
        for p in valid_parts:
            c = p["color_6"]
            if c not in unique_colors_6:
                unique_colors_6.append(c)

        color_to_extruder = {c: idx + 1 for idx, c in enumerate(unique_colors_6)}
        for p in valid_parts:
            p["assigned_extruder"] = color_to_extruder[p["color_6"]]

        num_filaments = len(unique_colors_6)

    # ──────────────────────────────────────────────────────────────
    # 3. Wyznaczenie środka modelu i macierzy pozycjonowania na stole
    # ──────────────────────────────────────────────────────────────
    # Nie przesuwamy wierzchołków poszczególnych siatek (zachowujemy 100% relatywne pozycje).
    # Cały zespół (Assembly) pozycjonujemy na środku stołu (128, 128) z dołem na Z=0.
    all_bounds_min = np.min([p["mesh"].bounds[0] for p in valid_parts], axis=0)
    all_bounds_max = np.max([p["mesh"].bounds[1] for p in valid_parts], axis=0)
    model_center = (all_bounds_min + all_bounds_max) / 2.0

    tx = 128.0 - float(model_center[0])
    ty = 128.0 - float(model_center[1])
    tz = 0.0 - float(all_bounds_min[2])
    transform_matrix = f"1 0 0 0 1 0 0 0 1 {tx:.6f} {ty:.6f} {tz:.6f}"

    # Identyfikatory odwzorowane z Keychain Draft.3mf: obiekt montażowy 7607,
    # części numerowane od 10001 w osobnym pliku 3D/Objects/object-7607.model.
    main_id = 7607
    main_uuid = str(uuid.uuid4())
    build_uuid = str(uuid.uuid4())
    item_uuid = str(uuid.uuid4())
    objects_path = f"/3D/Objects/object-{main_id}.model"

    objects_xml_list = []
    components_xml_list = []
    model_settings_parts_xml = []

    for idx, p in enumerate(valid_parts):
        part_id = 10001 + idx
        safe_name = xml_escape(p["name"])
        ext_num = p["assigned_extruder"]
        v_xml, t_xml = _mesh_to_xml(p["mesh"], indent="          ")

        objects_xml_list.append(
            f'    <object id="{part_id}" type="model" name="{safe_name}">\n'
            f'      <mesh>\n'
            f'        <vertices>\n'
            f'{v_xml}\n'
            f'        </vertices>\n'
            f'        <triangles>\n'
            f'{t_xml}\n'
            f'        </triangles>\n'
            f'      </mesh>\n'
            f'    </object>'
        )

        components_xml_list.append(
            f'        <component p:path="{objects_path}" objectid="{part_id}"/>'
        )

        model_settings_parts_xml.append(
            f'    <part id="{part_id}" subtype="normal_part">\n'
            f'      <metadata key="name" value="{safe_name}"/>\n'
            f'      <metadata key="extruder" value="{ext_num}"/>\n'
            f'      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n'
            f'    </part>'
        )

    objects_joined = "\n".join(objects_xml_list)
    components_joined = "\n".join(components_xml_list)

    # 3D/Objects/object-7607.model - wyłącznie geometria poszczególnych części.
    objects_model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"'
        ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"'
        ' requiredextensions="p">\n'
        '  <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
        '  <resources>\n'
        f'{objects_joined}\n'
        '  </resources>\n'
        '  <build/>\n'
        '</model>'
    )

    # 3D/3dmodel.model - wyłącznie kontroler montażu, bez żadnej siatki.
    main_3dmodel_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"'
        ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
        ' requiredextensions="p">\n'
        '  <metadata name="Application">BambuStudio-01.07.04.52</metadata>\n'
        f'  <metadata name="Title">{xml_escape(clean_title)}</metadata>\n'
        f'  <metadata name="CreationDate">{created_at}</metadata>\n'
        '  <resources>\n'
        f'    <object id="{main_id}" p:uuid="{main_uuid}" type="model">\n'
        '      <components>\n'
        f'{components_joined}\n'
        '      </components>\n'
        '    </object>\n'
        '  </resources>\n'
        f'  <build p:uuid="{build_uuid}">\n'
        f'    <item objectid="{main_id}" p:uuid="{item_uuid}" transform="{transform_matrix}" printable="1"/>\n'
        '  </build>\n'
        '</model>'
    )

    model_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        f'  <Relationship Target="{objects_path}" Id="rel-{main_id}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>'
    )

    parts_config_joined = "\n".join(model_settings_parts_xml)
    filament_maps_str = " ".join(["1"] * num_filaments)

    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        f'  <object id="{main_id}">\n'
        f'    <metadata key="name" value="{xml_escape(clean_title)}.3mf"/>\n'
        '    <metadata key="extruder" value="1"/>\n'
        '    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n'
        f'{parts_config_joined}\n'
        '  </object>\n'
        '  <plate>\n'
        '    <metadata key="plater_id" value="1"/>\n'
        '    <metadata key="plater_name" value="plate-1"/>\n'
        '    <model_instance>\n'
        f'      <metadata key="object_id" value="{main_id}"/>\n'
        '      <metadata key="instance_id" value="0"/>\n'
        '    </model_instance>\n'
        '    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n'
        f'    <metadata key="filament_maps" value="{filament_maps_str}"/>\n'
        '  </plate>\n'
        '  <assemble>\n'
        f'    <assemble_item object_id="{main_id}" instance_id="0" offset="0 0 0"/>\n'
        '  </assemble>\n'
        '</config>'
    )

    extra_filaments = print_settings.get("filaments")
    filament_profiles = []
    for i in range(num_filaments):
        color = unique_colors_6[i] if i < len(unique_colors_6) else "#FFFFFF"
        part_for_ext = next((p for p in valid_parts if p.get("assigned_extruder") == i + 1), None)
        user_fil = part_for_ext.get("filament") if part_for_ext else None
        if not user_fil and isinstance(extra_filaments, list):
            for ef in extra_filaments:
                if not isinstance(ef, dict):
                    continue
                if format_hex_6(ef.get("color") or "") == color:
                    user_fil = ef
                    break
        filament_profiles.append(resolve_filament_profile(color, user_fil, clean_mat))

    if "PLA" in clean_mat:
        bambu_fil_id = "Bambu PLA Basic @BBL A1"
    elif "PET" in clean_mat:
        bambu_fil_id = "Bambu PETG Basic @BBL A1"
    elif "TPU" in clean_mat:
        bambu_fil_id = "Bambu TPU 95A @BBL A1"
    elif "ABS" in clean_mat:
        bambu_fil_id = "Bambu ABS @BBL A1"
    else:
        bambu_fil_id = f"Bambu {clean_mat} Basic @BBL A1"

    print_preset = get_bambu_process_preset(layer_height)
    printer_machine = f"Bambu Lab A1 {nozzle_size:.1f} nozzle" if nozzle_size in [0.2, 0.4, 0.6, 0.8] else "Bambu Lab A1 0.4 nozzle"

    layer_h_str = f"{layer_height:.2f}".rstrip("0").rstrip(".") if layer_height in [0.2, 0.1, 0.3] else f"{layer_height:.2f}"

    project_settings_dict = {
        "ironing_type": "top",
        "different_settings_to_system": [
            "wall_generator;ironing_type;enable_support;support_type"
        ] + [""] * (num_filaments - 1),
        "wall_generator": "arachne",
        "curr_bed_type": "Textured PEI Plate",
        "filament_colour": [fp["color"] for fp in filament_profiles],
        "filament_diameter": ["1.75"] * num_filaments,
        "filament_is_support": ["0"] * num_filaments,
        "filament_type": [fp["type"] for fp in filament_profiles],
        "filament_vendor": ["SUNLU"] * num_filaments,
        "filament_settings_id": [bambu_fil_id] * num_filaments,
        "nozzle_temperature": [str(fp["nozzle_temperature"]) for fp in filament_profiles],
        "nozzle_temperature_initial_layer": [str(fp["nozzle_temperature"]) for fp in filament_profiles],
        "hot_plate_temp": [str(fp["bed_temperature"]) for fp in filament_profiles],
        "hot_plate_temp_initial_layer": [str(fp["bed_temperature"]) for fp in filament_profiles],
        "filament_density": [str(fp["density"]) for fp in filament_profiles],
        "layer_height": layer_h_str,
        "wall_loops": "2",
        "sparse_infill_density": f"{safe_infill}%",
        "enable_support": "0",
        "support_type": "normal(auto)",
        "printable_area": ["0x0", "256x0", "256x256", "0x256"],
        "printable_height": "256",
        "bed_exclude_area": [],
        "printer_model": "Bambu Lab A1",
        "wipe_tower_x": ["15"],
        "wipe_tower_y": ["116"],
        "print_settings_id": print_preset,
        "printer_settings_id": printer_machine,
        "printer_variant": f"{nozzle_size:.1f}",
        "nozzle_diameter": [f"{nozzle_size:.1f}"],
    }
    project_settings_json = json.dumps(project_settings_dict, indent=4)

    plate_png_bytes = create_dummy_png(200, 200, color=(38, 42, 51))

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
        '  <Default Extension="png" ContentType="image/png"/>\n'
        '  <Default Extension="gcode" ContentType="text/x.gcode"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '  <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>\n'
        '</Relationships>'
    )

    if not output_path:
        if model_path:
            out_dir = Path(model_path).parent
        else:
            out_dir = Path("backend/projects_3mf")
        safe_model_name = sanitize_filename(Path(file_name).stem)
        safe_mat = sanitize_filename(clean_mat)
        filename = f"ORDER_{order_id[:8]}_{safe_model_name}_{safe_mat}_{nozzle_size}mm.3mf"
        output_path = str(out_dir / filename)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    archive_files = {
        "[Content_Types].xml": content_types_xml,
        "_rels/.rels": rels_xml,
        "3D/3dmodel.model": main_3dmodel_xml,
        "3D/_rels/3dmodel.model.rels": model_rels_xml,
        f"3D/Objects/object-{main_id}.model": objects_model_xml,
        "Metadata/model_settings.config": model_settings_xml,
        "Metadata/project_settings.config": project_settings_json,
        "Metadata/plate_1.png": plate_png_bytes,
    }

    bambu_comment = b"created by BambuLab"
    dt_now = datetime.datetime.now().timetuple()[:6]

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.comment = bambu_comment
        for arcname, content in archive_files.items():
            zinfo = zipfile.ZipInfo(filename=arcname, date_time=dt_now)
            zinfo.comment = bambu_comment
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            encoded_content = content.encode("utf-8") if isinstance(content, str) else content
            zf.writestr(zinfo, encoded_content)

    # Rygorystyczna walidacja pakietu
    validation = validate_3mf_package(output_path)
    if not validation["valid"]:
        raise ValueError(f"Błąd walidacji wygenerowanego pakietu 3MF: {validation['errors']}")

    return output_path


def validate_3mf_package(file_path: str) -> dict:
    """
    Rygorystyczna walidacja pakietu .3MF sprawdzająca rzeczywisty łańcuch zależności
    wymagany przez Bambu Studio (odtworzony z referencyjnego Keychain Draft.3mf):
    
    1. Archiwum ZIP jest poprawne z komentarzem 'created by BambuLab'.
    2. Obecność manifestów relacji OPC ([Content_Types].xml, _rels/.rels).
    3. 3D/3dmodel.model jest kontrolerem Assembly z obiektem nadrzędnym i tagami <component>.
    4. 3D/_rels/3dmodel.model.rels posiada relację do pliku 3D/Objects/object-XXXX.model.
    5. Plik 3D/Objects/object-XXXX.model istnieje w archiwum i zawiera obiekty o ID odpowiadających
       każdemu <component objectid="..."> z głównego modelu.
    6. Metadata/model_settings.config zawiera sekcję <object id="XXXX"> z wpisami
       <part id="..." subtype="normal_part"> dla każdego komponentu.
    7. Każdy part posiada <metadata key="extruder" value="N"/> wskazujący numer ekstrudera.
    8. Metadata/project_settings.config jest poprawnym plikiem JSON zawierającym tablicę
       filament_colour oraz parametry Bambu Lab A1.
    9. Wartość extruder 'N' poprawnie indeksuje tablicę filament_colour (1 <= N <= len(filament_colour)),
       a kolor pod indeksem N-1 jest prawidłowym kodem HEX.
    10. Metadata/plate_1.png jest prawidłowym plikiem graficznym PNG.
    """
    import xml.etree.ElementTree as ET
    errors = []
    details = {}

    if not os.path.exists(file_path):
        return {"valid": False, "errors": [f"Plik {file_path} nie istnieje."]}

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            namelist = zf.namelist()
            details["namelist"] = namelist
            details["zip_comment"] = zf.comment.decode("utf-8", errors="replace")

            # 1. Manifesty OPC
            if "[Content_Types].xml" not in namelist:
                errors.append("Brak pliku [Content_Types].xml.")
            if "_rels/.rels" not in namelist:
                errors.append("Brak pliku _rels/.rels.")

            # 2. Główny model 3D/3dmodel.model
            if "3D/3dmodel.model" not in namelist:
                errors.append("Brak pliku 3D/3dmodel.model w archiwum.")
                return {"valid": False, "errors": errors, "details": details}

            model_xml_str = zf.read("3D/3dmodel.model").decode("utf-8", errors="replace")
            try:
                model_root = ET.fromstring(model_xml_str)
            except Exception as e:
                errors.append(f"Błąd parsowania XML w 3D/3dmodel.model: {e}")
                return {"valid": False, "errors": errors, "details": details}

            # Sprawdzenie obiektu montażu i komponentów
            resources = model_root.find("{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}resources")
            if resources is None:
                resources = model_root.find("resources")

            if resources is None:
                errors.append("Brak sekcji <resources> w 3D/3dmodel.model.")
                return {"valid": False, "errors": errors, "details": details}

            assembly_obj = None
            component_objectids = []
            component_paths = []

            for obj in resources:
                # Szukamy obiektu posiadającego <components>
                comps = obj.find("{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}components")
                if comps is None:
                    comps = obj.find("components")
                if comps is not None:
                    assembly_obj = obj
                    for comp in comps:
                        obj_id = comp.attrib.get("objectid")
                        if obj_id:
                            component_objectids.append(obj_id)
                        # p:path
                        p_path = None
                        for k, v in comp.attrib.items():
                            if k.endswith("path"):
                                p_path = v
                        if p_path:
                            component_paths.append(p_path)

            if not assembly_obj:
                errors.append("Brak obiektu montażowego (Assembly) z tagiem <components> w 3D/3dmodel.model.")
                return {"valid": False, "errors": errors, "details": details}

            main_obj_id = assembly_obj.attrib.get("id")
            details["assembly_object_id"] = main_obj_id
            details["component_objectids"] = component_objectids

            if not component_objectids:
                errors.append("Brak komponentów wewnątrz obiektu montażowego w 3D/3dmodel.model.")

            build_el = model_root.find("{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}build")
            if build_el is None:
                build_el = model_root.find("build")
            if build_el is not None:
                items = list(build_el)
                item_ids = [it.attrib.get("objectid") for it in items]
                details["build_item_objectids"] = item_ids
                if item_ids != [str(main_obj_id)]:
                    errors.append(
                        f"<build> powinno zawierać wyłącznie item objectid='{main_obj_id}', jest: {item_ids}"
                    )

            # Kontroler montażu nie może zawierać własnej geometrii - Bambu Studio
            # spłaszcza wtedy projekt do jednej bryły.
            for obj in resources:
                mesh_el = obj.find("{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}mesh")
                if mesh_el is None:
                    mesh_el = obj.find("mesh")
                if mesh_el is not None:
                    errors.append(
                        f"3D/3dmodel.model zawiera <mesh> w obiekcie id='{obj.attrib.get('id')}' "
                        "- geometria musi być w 3D/Objects/."
                    )

            details["component_paths"] = component_paths
            if len(component_paths) != len(component_objectids):
                errors.append("Każdy <component> musi mieć atrybut p:path do pliku w 3D/Objects/.")

            # 3. Relacja OPC 3D/_rels/3dmodel.model.rels
            if "3D/_rels/3dmodel.model.rels" not in namelist:
                errors.append("Brak pliku 3D/_rels/3dmodel.model.rels.")
            else:
                rels_str = zf.read("3D/_rels/3dmodel.model.rels").decode("utf-8", errors="replace")
                if "3D/Objects/" not in rels_str:
                    errors.append("Relacja w 3D/_rels/3dmodel.model.rels nie wskazuje na ścieżkę 3D/Objects/.")

            # 4. Geometria części w 3D/Objects/object-XXXX.model
            expected_objects_file = f"3D/Objects/object-{main_obj_id}.model"
            matching_object_files = [f for f in namelist if f.startswith("3D/Objects/") and f.endswith(".model")]
            if not matching_object_files:
                errors.append(f"Brak pliku geometrii części w 3D/Objects/ (oczekiwano {expected_objects_file}).")
            else:
                obj_file_name = matching_object_files[0]
                obj_xml_str = zf.read(obj_file_name).decode("utf-8", errors="replace")
                try:
                    obj_root = ET.fromstring(obj_xml_str)
                    obj_resources = obj_root.find("{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}resources")
                    if obj_resources is None:
                        obj_resources = obj_root.find("resources")

                    existing_part_ids = []
                    if obj_resources is not None:
                        for part_node in obj_resources:
                            pid = part_node.attrib.get("id")
                            if pid:
                                existing_part_ids.append(pid)

                    details["object_model_part_ids"] = existing_part_ids

                    for c_id in component_objectids:
                        if c_id not in existing_part_ids:
                            errors.append(f"Komponent objectid='{c_id}' nie istnieje w {obj_file_name}.")
                except Exception as e:
                    errors.append(f"Błąd parsowania XML w {obj_file_name}: {e}")

            comment = details.get("zip_comment") or ""
            entry_comments = {i.filename: i.comment for i in zf.infolist()}
            details["entry_comments_ok"] = all(
                b"created by BambuLab" in (c or b"") for c in entry_comments.values()
            )
            if not details["entry_comments_ok"]:
                errors.append("Nie wszystkie wpisy ZIP mają komentarz 'created by BambuLab'.")

            # 5. Sprawdzenie Metadata/project_settings.config (JSON)
            if "Metadata/project_settings.config" not in namelist:
                errors.append("Brak pliku Metadata/project_settings.config.")
                filament_colours = []
            else:
                ps_raw = zf.read("Metadata/project_settings.config").decode("utf-8", errors="replace")
                try:
                    ps_json = json.loads(ps_raw)
                    filament_colours = ps_json.get("filament_colour") or []
                    details["filament_colours"] = filament_colours
                    details["printer_model"] = ps_json.get("printer_model")
                    details["filament_settings_id"] = ps_json.get("filament_settings_id")

                    if not filament_colours or not isinstance(filament_colours, list):
                        errors.append("Pole filament_colour w Metadata/project_settings.config jest puste lub nie jest listą.")
                    if "layer_height" not in ps_json:
                        errors.append("Brak pola layer_height w Metadata/project_settings.config.")
                    if ps_json.get("printer_model") != "Bambu Lab A1":
                        errors.append(f"Nieoczekiwany printer_model: {ps_json.get('printer_model')} (oczekiwano 'Bambu Lab A1').")
                except json.JSONDecodeError as jde:
                    errors.append(f"Błąd dekodowania JSON w Metadata/project_settings.config: {jde}")
                    filament_colours = []

            # 6. Sprawdzenie Metadata/model_settings.config
            if "Metadata/model_settings.config" not in namelist:
                errors.append("Brak pliku Metadata/model_settings.config.")
            else:
                ms_raw = zf.read("Metadata/model_settings.config").decode("utf-8", errors="replace")
                try:
                    ms_root = ET.fromstring(ms_raw)
                    config_obj = ms_root.find("object")
                    if config_obj is None or config_obj.attrib.get("id") != str(main_obj_id):
                        errors.append(f"Brak sekcji <object id=\"{main_obj_id}\"> w Metadata/model_settings.config.")
                    else:
                        parts_found = config_obj.findall("part")
                        part_extruders = {}
                        for p_node in parts_found:
                            p_id = p_node.attrib.get("id")
                            if p_node.attrib.get("subtype") != "normal_part":
                                errors.append(f"Część id='{p_id}' w model_settings.config nie ma atrybutu subtype='normal_part'.")
                            ext_val = None
                            for m in p_node.findall("metadata"):
                                if m.attrib.get("key") == "extruder":
                                    ext_val = m.attrib.get("value")
                            if ext_val is None:
                                errors.append(f"Część id='{p_id}' w model_settings.config nie ma metadanej 'extruder'.")
                            else:
                                part_extruders[p_id] = ext_val

                        details["part_extruders"] = part_extruders

                        # Weryfikacja: każdy component_objectid musi mieć odpowiadający part w model_settings.config
                        for c_id in component_objectids:
                            if c_id not in part_extruders:
                                errors.append(f"Komponent objectid='{c_id}' nie ma wpisu <part id='{c_id}'> w model_settings.config.")
                            else:
                                ext_num_str = part_extruders[c_id]
                                try:
                                    ext_num = int(ext_num_str)
                                    if ext_num < 1 or ext_num > len(filament_colours):
                                        errors.append(
                                            f"Część id='{c_id}' wskazuje ekstruder {ext_num}, "
                                            f"ale filament_colour ma tylko {len(filament_colours)} pozycji."
                                        )
                                    else:
                                        # Sprawdzenie czy kolor jest poprawnym kodem hex
                                        col = filament_colours[ext_num - 1]
                                        if not (col.startswith("#") and len(col) == 7):
                                            errors.append(f"Nieprawidłowy kod koloru '{col}' pod ekstruderem {ext_num}.")
                                except ValueError:
                                    errors.append(f"Nieprawidłowa wartość numeryczna ekstrudera: '{ext_num_str}'.")

                        # Sprawdzenie czy <assemble> i <plate> istnieją
                        if ms_root.find("assemble") is None:
                            errors.append("Brak sekcji <assemble> w Metadata/model_settings.config.")
                        if ms_root.find("plate") is None:
                            errors.append("Brak sekcji <plate> w Metadata/model_settings.config.")

                except Exception as e:
                    errors.append(f"Błąd parsowania XML w Metadata/model_settings.config: {e}")

            # 7. Miniatura plate_1.png
            if "Metadata/plate_1.png" in namelist:
                png_header = zf.read("Metadata/plate_1.png")[:8]
                if not png_header.startswith(b"\x89PNG"):
                    errors.append("Metadata/plate_1.png nie jest poprawnym plikiem PNG.")
            else:
                errors.append("Brak pliku miniatury Metadata/plate_1.png.")

    except Exception as e:
        return {"valid": False, "errors": [f"Błąd odczytu archiwum ZIP: {e}"]}

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "details": details,
    }
