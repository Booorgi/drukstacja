"""
Drukstacja - Hybrydowa analiza plików (standard JLCPCB / PCBWay)
Obsługuje:
1. Natychmiastową analizę geometrii 3D (Instant 3D Calculation) dla siatek i brył CAD:
   .stl, .obj, .3mf, .ply, .glb, .gltf, .off, .3ds, .step, .stp, .iges, .igs, .brep
2. Automatyczną ekstrakcję modeli 3D z archiwów (.zip, .tar, itp.)
3. Kwalifikację dokumentacji technicznej, rysunków i PCB do wyceny inżynierskiej (RFQ):
   .dxf, .dwg, .pdf, .fcstd, .ifc, .3dm, .gbr, .ger, .kicad_pcb, .pcbdoc, .zip/rar
"""
import os
import io
import json
import zipfile
import tarfile
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import xml.etree.ElementTree as XmlET

from lxml import etree as lxml_etree
import trimesh
import numpy as np


# --------------------------------------------------------------------------
# KATEGORYZACJA ROZSZERZEŃ
# --------------------------------------------------------------------------

# Grupa A: Natychmiastowa analiza geometrii 3D (Mesh & CAD)
INSTANT_MESH_EXTENSIONS = {
    ".stl", ".obj", ".3mf", ".ply", ".glb", ".gltf", ".off", ".3ds"
}
INSTANT_CAD_EXTENSIONS = {
    ".step", ".stp", ".iges", ".igs", ".brep"
}
INSTANT_3D_EXTENSIONS = INSTANT_MESH_EXTENSIONS | INSTANT_CAD_EXTENSIONS

# Archiwa
ARCHIVE_EXTENSIONS = {
    ".zip", ".rar", ".7z", ".tar", ".gz", ".tar.gz", ".tgz", ".bz2"
}

# Grupa B: Pliki do wyceny manualnej / inżynierskiej (RFQ)
RFQ_DRAWINGS_EXTENSIONS = {
    ".dxf", ".dwg", ".pdf", ".png", ".jpg", ".jpeg"
}
RFQ_CAD_BIM_EXTENSIONS = {
    ".fcstd", ".ifc", ".acad", ".bim", ".3dm", ".model"
}
RFQ_PCB_EXTENSIONS = {
    ".gbr", ".ger", ".gtl", ".gbl", ".gts", ".gbs", ".drl",
    ".kicad_pcb", ".pcbdoc", ".brd"
}

ALL_RFQ_EXTENSIONS = (
    RFQ_DRAWINGS_EXTENSIONS | RFQ_CAD_BIM_EXTENSIONS | RFQ_PCB_EXTENSIONS | ARCHIVE_EXTENSIONS
)

ALL_SUPPORTED_EXTENSIONS = INSTANT_3D_EXTENSIONS | ALL_RFQ_EXTENSIONS


class UnsupportedFileType(Exception):
    pass


# --------------------------------------------------------------------------
# POMOCNICZE: ANALIZA SIATKI TRIMESH
# --------------------------------------------------------------------------

def _local_tag(tag: str) -> str:
    if not tag:
        return ""
    if tag[0] == "{":
        return tag.split("}", 1)[-1]
    return tag


def _hex_to_rgba(hex_color: str) -> np.ndarray:
    raw = (hex_color or "#888888").strip()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) == 8:
        r, g, b, a = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), int(raw[6:8], 16)
    elif len(raw) == 6:
        r, g, b, a = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), 255
    else:
        r, g, b, a = 136, 136, 136, 255
    return np.array([r, g, b, a], dtype=np.uint8)


# Kody malowania wielokolorowego: Bambu Studio / OrcaSlicer zapisuja je w atrybucie
# paint_color trojkata, PrusaSlicer w slic3rpe:mmu_segmentation (ten sam format).
# Pozycja na liscie + 1 = numer slotu AMS, czyli indeks w filament_colour + 1.
PAINT_SLOT_CODES = [
    "4", "8", "0C", "1C", "2C", "3C", "4C", "5C",
    "6C", "7C", "8C", "9C", "AC", "BC", "CC", "DC",
]

# Awaryjna paleta, gdy plik ma malowanie, ale nie niesie listy filament_colour.
DEFAULT_AMS_PALETTE = ["#1A1A1A", "#F5F5F5", "#D32F2F", "#1976D2"]


def decode_paint_slot(code: str) -> int:
    """
    Zwraca dominujacy slot AMS (1-based) zakodowany w paint_color; 0 = brak malowania.

    Trojkat pomalowany w calosci ma dokladnie jeden kod (np. "4"). Trojkat
    przeciety pedzlem niesie dluzszy ciag z wieloma kodami - dla podgladu bierzemy
    kolor o najwiekszej liczbie wystapien, wiec granica biegnie po krawedziach siatki.
    Kody dwuznakowe zdejmujemy przed jednoznakowymi, inaczej "8" zjadloby "8C".
    """
    rest = (code or "").strip().upper()
    if not rest:
        return 0

    counts: Dict[int, int] = {}
    for slot in range(len(PAINT_SLOT_CODES), 0, -1):
        token = PAINT_SLOT_CODES[slot - 1]
        occurrences = rest.count(token)
        if occurrences:
            counts[slot] = occurrences
            rest = rest.replace(token, "")

    if not counts:
        return 0
    return max(counts.items(), key=lambda kv: (kv[1], -kv[0]))[0]


def _parse_xml(xml_bytes: bytes):
    """lxml jest znacznie szybszy na gestych .model z Bambu; huge_tree bo Jaguar ma dziesiatki MB XML."""
    try:
        parser = lxml_etree.XMLParser(huge_tree=True, recover=False)
        return lxml_etree.fromstring(xml_bytes, parser=parser)
    except Exception:
        return XmlET.fromstring(xml_bytes)


def _read_file_bytes(file_input) -> bytes:
    if isinstance(file_input, (str, Path)):
        with open(file_input, "rb") as f:
            return f.read()
    if isinstance(file_input, io.BytesIO):
        return file_input.getvalue()
    if isinstance(file_input, bytes):
        return file_input
    return bytes(file_input)


def _triangle_paint_code(attrib: Dict[str, str]) -> str:
    code = attrib.get("paint_color")
    if code:
        return code
    for key, value in attrib.items():
        if _local_tag(key) == "mmu_segmentation" and value:
            return value
    return ""


def _mesh_from_mesh_elem(mesh_elem, read_paint: bool = True) -> Optional[Tuple[trimesh.Trimesh, np.ndarray]]:
    """Siatka pojedynczego <mesh> wraz z numerem slotu AMS dla kazdego trojkata."""
    verts = []
    faces = []
    slots = []
    decoded_cache: Dict[str, int] = {}

    for child in mesh_elem:
        tag = _local_tag(child.tag)
        if tag == "vertices":
            for v in child:
                try:
                    verts.append([
                        float(v.attrib.get("x", 0.0)),
                        float(v.attrib.get("y", 0.0)),
                        float(v.attrib.get("z", 0.0)),
                    ])
                except Exception:
                    pass
        elif tag == "triangles":
            for t in child:
                try:
                    face = [
                        int(t.attrib.get("v1", 0)),
                        int(t.attrib.get("v2", 0)),
                        int(t.attrib.get("v3", 0)),
                    ]
                except Exception:
                    continue
                faces.append(face)
                if not read_paint:
                    slots.append(0)
                    continue
                code = _triangle_paint_code(t.attrib)
                if not code:
                    slots.append(0)
                    continue
                slot = decoded_cache.get(code)
                if slot is None:
                    slot = decode_paint_slot(code)
                    decoded_cache[code] = slot
                slots.append(slot)

    if not verts or not faces:
        return None

    mesh = trimesh.Trimesh(
        vertices=np.array(verts, dtype=float),
        faces=np.array(faces, dtype=int),
        process=False,
    )
    return mesh, np.array(slots, dtype=int)


def parse_model_xml_objects(xml_bytes: bytes, read_paint: bool = True) -> List[dict]:
    """Zwraca listę {'id', 'mesh', 'face_slots'} dla każdego <object> z siatką."""
    try:
        root = _parse_xml(xml_bytes)
    except Exception:
        return []

    objects = []
    for elem in root.iter():
        if _local_tag(elem.tag) != "object":
            continue
        obj_id = elem.attrib.get("id")
        mesh_elem = None
        for child in list(elem):
            if _local_tag(child.tag) == "mesh":
                mesh_elem = child
                break
        if mesh_elem is None:
            continue
        parsed = _mesh_from_mesh_elem(mesh_elem, read_paint=read_paint)
        if parsed is None:
            continue
        mesh, face_slots = parsed
        if len(mesh.faces) == 0:
            continue
        objects.append({
            "id": str(obj_id) if obj_id is not None else "",
            "mesh": mesh,
            "face_slots": face_slots,
        })
    return objects


def parse_model_xml_content(xml_bytes: bytes) -> Optional[trimesh.Trimesh]:
    """
    Błyskawiczny parser XML dla pojedynczego pliku .model (np. 3D/Objects/object_*.model).
    Wyciąga bezpośrednio wierzchołki i trójkąty bez narzutu biblioteki trimesh i resolverów sceny.
    """
    objects = parse_model_xml_objects(xml_bytes)
    if not objects:
        return None
    meshes = [o["mesh"] for o in objects]
    if len(meshes) == 1:
        return meshes[0]
    return trimesh.util.concatenate(meshes)


def _load_3mf_project_settings(zf: zipfile.ZipFile) -> dict:
    names = zf.namelist()
    ps_name = next(
        (n for n in names if n.replace("\\", "/").endswith("Metadata/project_settings.config")),
        None,
    )
    if not ps_name:
        return {}
    try:
        ps = json.loads(zf.read(ps_name).decode("utf-8", errors="replace"))
        return ps if isinstance(ps, dict) else {}
    except Exception as err:
        print(f"[WARN] Nie udało się odczytać project_settings: {err}")
        return {}


def _as_float(val, default=None):
    if val is None or val == "":
        return default
    if isinstance(val, (list, tuple)) and val:
        val = val[0]
    try:
        return float(str(val).replace("%", "").strip())
    except Exception:
        return default


def _typical_percent(val):
    """Bambu zapisuje wypełnienie jako listę per filament — bierzemy najczęstszą wartość."""
    if val is None or val == "":
        return None
    items = val if isinstance(val, (list, tuple)) else [val]
    cleaned = []
    for item in items:
        n = _as_float(item)
        if n is None:
            continue
        if 0 < n <= 1.0:
            n *= 100.0
        n = int(round(n))
        if 0 <= n <= 100:
            cleaned.append(n)
    if not cleaned:
        return None
    return max(set(cleaned), key=cleaned.count)


def _first_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (list, tuple)):
        return str(val[0]).strip() if val else ""
    return str(val).strip()


def _pretty_filament_preset(raw: str) -> str:
    s = str(raw or "").strip()
    if s.lower().startswith("bambu "):
        s = s[6:]
    if " @" in s:
        s = s.split(" @", 1)[0]
    return s.strip()


def _extract_3mf_print_profile(ps: dict) -> dict:
    """Warstwa, wypełnienie, dysza i filamenty zapisane w projekcie Bambu/Orca."""
    colours = []
    raw_colours = ps.get("filament_colour") or []
    if isinstance(raw_colours, list):
        for c in raw_colours:
            s = str(c).strip()
            if not s:
                continue
            if not s.startswith("#"):
                s = f"#{s}"
            colours.append(s.upper() if len(s) in (7, 9) else s)

    types = ps.get("filament_type") or []
    if isinstance(types, str):
        types = [types]
    unique_types = []
    seen = set()
    for t in types:
        s = str(t).strip()
        key = s.upper()
        if not s or key in seen:
            continue
        seen.add(key)
        unique_types.append(s)

    presets = ps.get("filament_settings_id") or []
    if isinstance(presets, str):
        presets = [presets]
    pretty_presets = []
    seen_p = set()
    for p in presets:
        name = _pretty_filament_preset(p)
        key = name.upper()
        if not name or key in seen_p:
            continue
        seen_p.add(key)
        pretty_presets.append(name)
    if pretty_presets:
        unique_types = pretty_presets

    nozzle = _as_float(ps.get("nozzle_diameter"), None)
    layer = _as_float(ps.get("layer_height"), None)
    infill = _typical_percent(ps.get("sparse_infill_density"))
    process = _first_str(ps.get("print_settings_id"))

    return {
        "filament_colours": colours,
        "filament_types": unique_types,
        "layer_height": layer,
        "infill": infill,
        "nozzle_size": nozzle,
        "print_settings_id": process or None,
    }


def _extract_3mf_slice_info(zf: zipfile.ZipFile) -> dict:
    """Czas i zużycie filamentu z ostatniego cięcia Bambu/Orca (slice_info.config)."""
    names = zf.namelist()
    si_name = next(
        (n for n in names if n.replace("\\", "/").endswith("Metadata/slice_info.config")),
        None,
    )
    if not si_name:
        return {}
    try:
        root = _parse_xml(zf.read(si_name))
    except Exception as err:
        print(f"[WARN] Nie udało się odczytać slice_info: {err}")
        return {}

    prediction_s = None
    weight_g = None
    used_g = 0.0
    used_m = 0.0
    used_slots = 0

    plates = [el for el in root.iter() if _local_tag(el.tag) == "plate"]
    targets = plates or [root]
    for plate in targets:
        for child in plate:
            tag = _local_tag(child.tag)
            if tag == "metadata":
                key = child.attrib.get("key")
                val = child.attrib.get("value")
                if key == "prediction":
                    prediction_s = _as_float(val)
                elif key == "weight":
                    weight_g = _as_float(val)
            elif tag == "filament":
                g = _as_float(child.attrib.get("used_g"), 0.0) or 0.0
                m = _as_float(child.attrib.get("used_m"), 0.0) or 0.0
                if g > 0.05 or m > 0.05:
                    used_g += g
                    used_m += m
                    used_slots += 1
        if used_g > 0 or (weight_g and weight_g > 0) or prediction_s:
            break

    if used_g <= 0 and weight_g:
        used_g = weight_g
    if used_g <= 0 and not prediction_s:
        return {}

    return {
        "filament_weight_g": round(float(used_g), 1),
        "filament_length_m": round(float(used_m), 2),
        "print_time_seconds": int(prediction_s or 0),
        "color_count": max(used_slots, 1),
    }


def _extract_3mf_color_metadata(zf: zipfile.ZipFile) -> Tuple[List[str], Dict[str, int], dict]:
    """Kolory AMS, mapa ekstruderów oraz profil druku z project_settings."""
    colours: List[str] = []
    extruders: Dict[str, int] = {}
    print_profile: dict = {}

    ps = _load_3mf_project_settings(zf)
    if ps:
        print_profile = _extract_3mf_print_profile(ps)
        colours = list(print_profile.get("filament_colours") or [])

    names = zf.namelist()
    ms_name = next(
        (n for n in names if n.replace("\\", "/").endswith("Metadata/model_settings.config")),
        None,
    )
    if ms_name:
        try:
            root = _parse_xml(zf.read(ms_name))
            # <object> niesie ekstruder bazowy calej bryly, <part> nadpisuje go
            # dla pojedynczej czesci - oba trafiaja do tej samej mapy po id.
            for el in root.iter():
                if _local_tag(el.tag) not in ("object", "part"):
                    continue
                pid = el.attrib.get("id")
                if not pid:
                    continue
                for child in el:
                    if _local_tag(child.tag) != "metadata":
                        continue
                    if child.attrib.get("key") != "extruder":
                        continue
                    val = child.attrib.get("value") or child.text
                    try:
                        extruders[str(pid)] = int(val)
                    except Exception:
                        pass
        except Exception as err:
            print(f"[WARN] Nie udało się odczytać model_settings extruder: {err}")

    return colours, extruders, print_profile


def load_3mf_bundle(file_input) -> dict:
    """
    Wczytuje .3MF: geometrię do slicera oraz opcjonalną siatkę z kolorami AMS (podgląd GLB).
    """
    file_bytes = _read_file_bytes(file_input)
    objects: List[dict] = []
    filament_colours: List[str] = []
    part_extruder: Dict[str, int] = {}
    print_profile: dict = {}
    skipped_paint = False
    slice_stats: dict = {}

    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
            names = z.namelist()
            object_models = [
                f for f in names if "3d/objects/" in f.lower() and f.lower().endswith(".model")
            ]
            all_models = [f for f in names if f.lower().endswith(".model")]
            target_models = object_models if object_models else all_models

            read_paint = len(file_bytes) < 12_000_000
            skipped_paint = not read_paint
            if skipped_paint:
                print(f"[INFO] Duży .3MF ({len(file_bytes)} B) — pomijam dekodowanie pędzla AMS.")
            for mf in target_models:
                try:
                    objects.extend(parse_model_xml_objects(z.read(mf), read_paint=read_paint))
                except Exception as parse_err:
                    print(f"[WARN] Błąd parsowania XML {mf}: {parse_err}")

            filament_colours, part_extruder, print_profile = _extract_3mf_color_metadata(z)
            slice_stats = _extract_3mf_slice_info(z)
    except Exception as zip_err:
        print(f"[WARN] Błąd inspekcji kontenera ZIP .3MF: {zip_err}")

    if not objects:
        raise ValueError("Nie udało się odczytać geometrii 3D z pliku .3MF.")

    meshes = [o["mesh"] for o in objects]
    mesh = meshes[0] if len(meshes) == 1 else trimesh.util.concatenate(meshes)

    # Slot AMS dla każdej ścianki: malowanie pędzlem ma pierwszeństwo,
    # a ścianki niepomalowane dziedziczą ekstruder swojej części/obiektu.
    face_slots_per_object = []
    for obj in objects:
        base = part_extruder.get(str(obj["id"]), 1)
        base = base if isinstance(base, int) and base >= 1 else 1
        painted_slots = obj.get("face_slots")
        n_faces = len(obj["mesh"].faces)
        if painted_slots is None or len(painted_slots) != n_faces:
            painted_slots = np.zeros(n_faces, dtype=int)
        face_slots_per_object.append(np.where(painted_slots > 0, painted_slots, base))

    palette = filament_colours or DEFAULT_AMS_PALETTE
    used_slots = sorted({int(s) for s in np.unique(np.concatenate(face_slots_per_object))})
    slot_hex = {s: palette[(s - 1) % len(palette)] for s in used_slots if s >= 1}

    # Jednokolorowy plik nie ma czego pokazywać - wtedy zostawiamy klientowi
    # swobodny wybór barwy filamentu zamiast blokować podgląd na kolorze z pliku.
    used_hex = {h.upper() for h in slot_hex.values()}
    has_file_colors = len(used_hex) >= 2

    painted_faces = 0
    total_faces = 0
    for obj in objects:
        slots = obj.get("face_slots")
        n = len(obj["mesh"].faces)
        total_faces += n
        if slots is not None and len(slots) == n:
            painted_faces += int(np.count_nonzero(slots > 0))
    painted_ratio = (painted_faces / total_faces) if total_faces else 0.0
    color_count = max(len(slot_hex), len(used_hex), 1)

    colored_mesh = None
    if has_file_colors:
        painted = []
        for obj, slots in zip(objects, face_slots_per_object):
            part = obj["mesh"]
            face_colors = np.zeros((len(part.faces), 4), dtype=np.uint8)
            for slot in np.unique(slots):
                face_colors[slots == slot] = _hex_to_rgba(slot_hex.get(int(slot), palette[0]))
            part.visual.face_colors = face_colors
            painted.append(part)
        colored_mesh = painted[0] if len(painted) == 1 else trimesh.util.concatenate(painted)

        # Odpowiednik fix_inversion, ktory dostaje siatka do slicera: plik zapisany
        # "na lewa strone" renderowalby sie w podgladzie jako wydmuszka.
        try:
            if colored_mesh.volume < 0:
                colored_mesh.invert()
        except Exception:
            pass

    used_hex_list = [slot_hex[s] for s in used_slots if s in slot_hex]
    profile_colours = list((print_profile or {}).get("filament_colours") or [])
    file_profile = dict(print_profile or {})
    if len(used_hex_list) >= 2:
        file_profile["filament_colours"] = used_hex_list
    elif profile_colours:
        file_profile["filament_colours"] = profile_colours
    else:
        file_profile["filament_colours"] = used_hex_list[:1]
    if not file_profile.get("filament_types") and used_hex_list:
        file_profile["filament_types"] = []

    if skipped_paint and len(profile_colours) >= 2:
        color_count = max(color_count, len(profile_colours))
        if painted_ratio < 0.05:
            painted_ratio = 0.66
    if slice_stats.get("color_count"):
        color_count = max(color_count, int(slice_stats["color_count"]))
    if slice_stats:
        file_profile["slice_stats"] = slice_stats

    return {
        "mesh": mesh,
        "colored_mesh": colored_mesh,
        "filament_colours": used_hex_list if has_file_colors else [],
        "part_count": len(objects),
        "has_file_colors": has_file_colors,
        "color_count": int(color_count),
        "painted_ratio": round(float(painted_ratio), 4),
        "file_profile": file_profile,
    }


def parse_3mf_safely(file_input) -> trimesh.Trimesh:
    """
    Stabilna funkcja do wczytywania plików .3MF (w tym plików z klastrami obiektów
    Bambu Studio / OrcaSlicer w 3D/Objects/*.model).
    Chroni serwer przed timeoutami, pętlami resolvera 'world' oraz nadmiernym zużyciem RAM.
    """
    return load_3mf_bundle(file_input)["mesh"]


def load_3mf_mesh(file_path: str) -> trimesh.Trimesh:
    """Wczytuje model z pliku .3MF bezpiecznie i wydajnie."""
    return parse_3mf_safely(file_path)


def analyze_trimesh_geometry(loaded_obj) -> dict:
    """Wyciąga parametry geometryczne z obiektu Trimesh lub Scene z automatyczną naprawą bryły."""
    if isinstance(loaded_obj, trimesh.Scene):
        if len(loaded_obj.geometry) == 0:
            raise ValueError("Plik 3D nie zawiera żadnych trójkątów ani geometrii.")
        valid_geoms = [
            g for g in loaded_obj.geometry.values()
            if hasattr(g, "faces") and len(g.faces) > 0
        ]
        if not valid_geoms:
            raise ValueError("Plik 3D nie zawiera poprawnej geometrii trójkątów.")
        try:
            mesh = loaded_obj.to_geometry()
            if not isinstance(mesh, trimesh.Trimesh):
                mesh = trimesh.util.concatenate(list(valid_geoms))
        except Exception:
            mesh = trimesh.util.concatenate(list(valid_geoms))
    else:
        mesh = loaded_obj

    if not isinstance(mesh, trimesh.Trimesh):
        # Konwersja na siatkę jeśli to możliwe
        mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces)

    n_faces = int(len(mesh.faces))
    # 1. Naprawa topologii - na gestych 3MF (Jaguar) fix_winding/normals zjada limity czasu.
    try:
        if n_faces < 80000:
            if hasattr(mesh, "process"):
                mesh.process(validate=True)
            if hasattr(mesh, "remove_unreferenced_vertices"):
                mesh.remove_unreferenced_vertices()
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fix_winding(mesh)
            trimesh.repair.fix_inversion(mesh)
    except Exception as repair_err:
        print(f"[WARN] Błąd naprawy siatki trimesh: {repair_err}")

    # 2. Próba załatania drobnych mikroszczelin
    watertight = bool(mesh.is_watertight)
    if not watertight and n_faces < 80000:
        try:
            trimesh.repair.fill_holes(mesh)
            watertight = bool(mesh.is_watertight)
        except Exception:
            pass

    # 3. Precyzyjne wyliczenie rzeczywistej objętości bryły
    # Obliczamy objętość metodą całki powierzchniowej Gaussa (signed volume)
    volume_mm3 = 0.0
    bbox = mesh.bounding_box.extents  # [x, y, z] w mm
    bbox_volume = float(np.prod(bbox)) if len(bbox) == 3 else 1e9

    try:
        raw_vol = mesh.volume
        if raw_vol is not None and not np.isnan(raw_vol) and abs(raw_vol) > 0:
            if abs(raw_vol) <= bbox_volume * 1.05:
                volume_mm3 = abs(float(raw_vol))
    except Exception as vol_err:
        print(f"[WARN] Błąd odczytu mesh.volume: {vol_err}")

    # Jeśli signed volume zawiodło, spróbuj voxelized volume lub orientację wypukłą z redukcją
    if volume_mm3 <= 0.0:
        if n_faces < 80000:
            try:
                voxel_pitch = max(mesh.extents) / 64.0
                vox = mesh.voxelized(pitch=voxel_pitch).fill()
                volume_mm3 = float(vox.volume)
            except Exception:
                pass
        if volume_mm3 <= 0.0:
            if n_faces < 80000 and hasattr(mesh, "convex_hull"):
                hull_vol = abs(float(mesh.convex_hull.volume))
            else:
                hull_vol = bbox_volume
            volume_mm3 = hull_vol * 0.35  # realistyczny udział ścianek w pustych obudowach

    surface_area_mm2 = float(mesh.area) if hasattr(mesh, "area") else 0.0

    return {
        "volume_cm3": round(volume_mm3 / 1000.0, 3),
        "dimensions_mm": [round(float(v), 2) for v in bbox],
        "surface_area_cm2": round(surface_area_mm2 / 100.0, 2),
        "watertight": watertight,
        "triangle_count": int(len(mesh.faces)),
        "mesh_object": mesh,
    }


def analyze_mesh_file(path: str, ext: str) -> dict:
    """Wczytuje siatkę 3D (.stl, .obj, .3mf, .ply, .glb, .gltf, .off) przez trimesh lub wyspecjalizowany parser."""
    file_type = ext.lstrip(".").lower()
    if file_type == "3mf":
        bundle = load_3mf_bundle(path)
        geom = analyze_trimesh_geometry(bundle["mesh"])
        geom["colored_mesh"] = bundle.get("colored_mesh")
        geom["filament_colours"] = bundle.get("filament_colours") or []
        geom["part_count"] = bundle.get("part_count") or 1
        geom["has_file_colors"] = bool(bundle.get("has_file_colors"))
        geom["color_count"] = int(bundle.get("color_count") or len(geom["filament_colours"]) or 1)
        geom["painted_ratio"] = float(bundle.get("painted_ratio") or 0.0)
        geom["file_profile"] = bundle.get("file_profile") or {}
        return geom

    loaded = trimesh.load(path)
    return analyze_trimesh_geometry(loaded)


def analyze_cad_file(path: str, ext: str) -> dict:
    """
    Bezpieczna próba analizy bryły parametrycznej CAD (.step / .stp / .iges).
    Wykorzystuje CadQuery jeśli dostępne, bądź trimesh cascade.
    """
    # 1. Próba przez CadQuery
    try:
        import cadquery as cq
        result = cq.importers.importStep(path)
        solid = result.val()

        volume_mm3 = float(solid.Volume())
        bbox = solid.BoundingBox()
        area_mm2 = float(solid.Area())

        return {
            "volume_cm3": round(volume_mm3 / 1000.0, 3),
            "dimensions_mm": [
                round(float(bbox.xlen), 2),
                round(float(bbox.ylen), 2),
                round(float(bbox.zlen), 2),
            ],
            "surface_area_cm2": round(area_mm2 / 100.0, 2),
            "watertight": True,
            "triangle_count": None,
            "mesh_object": None,
        }
    except Exception as cq_err:
        # 2. Próba przez trimesh
        try:
            loaded = trimesh.load(path)
            return analyze_trimesh_geometry(loaded)
        except Exception:
            # Fallback - przekazanie do manualnego RFQ zamiast błędu 500
            raise UnsupportedFileType(
                f"Złożona bryła CAD ({ext}) wymaga manualnej weryfikacji inżynierskiej."
            )


# --------------------------------------------------------------------------
# INSPEKCJA I ROZPAKOWYWANIE ARCHIWÓW
# --------------------------------------------------------------------------

def inspect_and_extract_archive(archive_path: str, temp_dir: str) -> Tuple[Optional[str], dict]:
    """
    Skanuje archiwum (.zip, .tar.*).
    - Jeśli znajdzie plik 3D (.stl, .step, .obj, .3mf), wypakowuje go do temp_dir i zwraca ścieżkę.
    - Jeśli nie, klasyfikuje zawartość (np. pakiety PCB/Gerber lub rysunki) do RFQ.
    """
    inner_files = []
    found_3d_file = None

    # Obsługa ZIP
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path, "r") as zf:
            for info in zf.infolist():
                if info.is_dir() or info.filename.startswith("__MACOSX/") or info.filename.startswith("."):
                    continue
                inner_files.append(info.filename)
                ext = Path(info.filename).suffix.lower()
                if ext in INSTANT_3D_EXTENSIONS and not found_3d_file:
                    found_3d_file = info.filename
                    zf.extract(info, temp_dir)

    # Obsługa TAR / TAR.GZ
    elif tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path, "r:*") as tf:
            for member in tf.getmembers():
                if member.isdir() or member.name.startswith("__MACOSX/") or member.name.startswith("."):
                    continue
                inner_files.append(member.name)
                ext = Path(member.name).suffix.lower()
                if ext in INSTANT_3D_EXTENSIONS and not found_3d_file:
                    found_3d_file = member.name
                    tf.extract(member, temp_dir)

    extracted_path = os.path.join(temp_dir, found_3d_file) if found_3d_file else None

    # Sprawdź czy archiwum zawiera pliki PCB / Gerber
    has_pcb = any(Path(f).suffix.lower() in RFQ_PCB_EXTENSIONS for f in inner_files)

    archive_meta = {
        "file_count": len(inner_files),
        "files_sample": inner_files[:10],
        "has_pcb": has_pcb,
        "extracted_3d_file": found_3d_file,
    }

    return extracted_path, archive_meta


# --------------------------------------------------------------------------
# GŁÓWNA FUNKCJA HYBRYDOWEJ ANALIZY PLIKU
# --------------------------------------------------------------------------

def process_uploaded_file(path: str, filename: str, temp_dir: str) -> dict:
    """
    Hybrydowy procesor plików produkcyjnych:
    Zwraca ustrukturyzowane metadane z flagą instant_pricing.
    """
    ext = Path(filename).suffix.lower()
    file_size_bytes = os.path.getsize(path)
    size_mb = round(file_size_bytes / (1024 * 1024), 2)

    # 1. ARCHIWA (.zip, .tar, .rar itp.)
    if ext in ARCHIVE_EXTENSIONS:
        try:
            extracted_path, archive_meta = inspect_and_extract_archive(path, temp_dir)
            if extracted_path and os.path.isfile(extracted_path):
                inner_ext = Path(extracted_path).suffix.lower()
                # Udało się wyciągnąć model 3D z archiwum!
                if inner_ext in INSTANT_MESH_EXTENSIONS:
                    geom = analyze_mesh_file(extracted_path, inner_ext)
                else:
                    geom = analyze_cad_file(extracted_path, inner_ext)

                geom.update({
                    "type": "3d_model",
                    "instant_pricing": True,
                    "category": "Model 3D (Wypakowany z ZIP)",
                    "message": f"Wypakowano i przeanalizowano model 3D: '{archive_meta['extracted_3d_file']}' z archiwum.",
                    "mesh_source_path": extracted_path,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "archive_meta": archive_meta,
                })
                return geom

            elif archive_meta.get("has_pcb"):
                return {
                    "type": "rfq_document",
                    "instant_pricing": False,
                    "category": "Płytka PCB & Gerber (Archiwum ZIP)",
                    "message": f"Wykryto pakiet produkcyjny PCB/Gerber ({archive_meta['file_count']} plików). Przekazano do wyceny inżynierskiej (24h).",
                    "volume_cm3": 0.0,
                    "dimensions_mm": [0.0, 0.0, 0.0],
                    "surface_area_cm2": 0.0,
                    "watertight": True,
                    "triangle_count": None,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "rfq_details": archive_meta,
                }
            else:
                return {
                    "type": "rfq_document",
                    "instant_pricing": False,
                    "category": "Archiwum projektowe (RFQ)",
                    "message": f"Archiwum projektowe ({archive_meta['file_count']} plików) przyjęte do manualnej analizy inżynierskiej (24h).",
                    "volume_cm3": 0.0,
                    "dimensions_mm": [0.0, 0.0, 0.0],
                    "surface_area_cm2": 0.0,
                    "watertight": True,
                    "triangle_count": None,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "rfq_details": archive_meta,
                }

        except Exception as arch_err:
            # W razie uszkodzonego lub niewspieranego typu archiwum (np. .rar bez biblioteki C)
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Archiwum skompresowane",
                "message": "Archiwum produkcyjne zostało przyjęte do bezpośredniej weryfikacji inżynierskiej.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": True,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"error": str(arch_err)},
            }

    # 2. PLIKI SIATEK 3D (Instant Mesh)
    if ext in INSTANT_MESH_EXTENSIONS:
        try:
            geom = analyze_mesh_file(path, ext)
            geom.update({
                "type": "3d_model",
                "instant_pricing": True,
                "category": f"Siatka 3D ({ext.upper().lstrip('.')})",
                "message": "Geometria 3D poprawnie przeanalizowana.",
                "mesh_source_path": path,
                "original_filename": filename,
                "file_size_mb": size_mb,
            })
            return geom
        except Exception as mesh_err:
            print(f"[WARN] Błąd analizy siatki ({ext}): {mesh_err}")
            # Bezpieczny fallback do RFQ w przypadku uszkodzonej siatki
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Model 3D (Nietypowy/Uszkodzony)",
                "message": f"Plik {ext} zawiera nietypową strukturę wierzchołków. Przekazano do naprawy i wyceny manualnej.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": False,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"error": str(mesh_err)},
            }

    # 3. PLIKI BRYŁ CAD / B-REP (STEP / IGES)
    if ext in INSTANT_CAD_EXTENSIONS:
        try:
            geom = analyze_cad_file(path, ext)
            geom.update({
                "type": "3d_model",
                "instant_pricing": True,
                "category": f"Bryła CAD ({ext.upper().lstrip('.')})",
                "message": "Parametryczna bryła CAD pomyślnie zinterpretowana.",
                "mesh_source_path": path,
                "original_filename": filename,
                "file_size_mb": size_mb,
            })
            return geom
        except Exception as cad_err:
            # Łagodny fallback do RFQ bez wywalania błędu 500
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Bryła CAD (B-Rep)",
                "message": f"Plik CAD ({ext.upper()}) wymaga manualnej konwersji i doboru parametrów przez inżyniera. Oferta w 24h.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": True,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"note": "B-Rep tessellation requires manual review", "info": str(cad_err)},
            }

    # 4. RYSUNKI TECHNICZNE I WEKTORY (DXF / DWG / PDF)
    if ext in RFQ_DRAWINGS_EXTENSIONS:
        cat_name = "Rysunek techniczny 2D / Wektor" if ext in (".dxf", ".dwg") else ("Dokumentacja PDF" if ext == ".pdf" else "Grafika / Rzut poglądowy")
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": cat_name,
            "message": f"Dokumentacja ({ext.upper()}) przyjęta do wyceny manualnej i weryfikacji wykonalności.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 5. PŁYTKI PCB & ELEKTRONIKA (Gerber, KiCad, Altium)
    if ext in RFQ_PCB_EXTENSIONS:
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": "Płytka PCB / Gerber",
            "message": f"Projekt PCB ({ext.upper()}) przyjęty do kalkulacji panelizacji i montażu elementów.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 6. PROJEKTY CAD / BIM (FreeCAD, IFC, Rhino 3DM)
    if ext in RFQ_CAD_BIM_EXTENSIONS:
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": "Projekt CAD / BIM",
            "message": f"Plik projektowy {ext.upper()} przyjęty do dekompozycji i przygotowania gniazd produkcyjnych.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 7. INNE / NIEZNANE FORMATY - Bezpieczny catch-all RFQ (NIGDY NIE WYWALA APLIKACJI)
    return {
        "type": "rfq_document",
        "instant_pricing": False,
        "category": f"Dokumentacja {ext.upper() if ext else 'Inna'}",
        "message": "Plik został pomyślnie przyjęty do indywidualnej wyceny inżynierskiej.",
        "volume_cm3": 0.0,
        "dimensions_mm": [0.0, 0.0, 0.0],
        "surface_area_cm2": 0.0,
        "watertight": True,
        "triangle_count": None,
        "original_filename": filename,
        "file_size_mb": size_mb,
        "rfq_details": {"format": ext},
    }


# Kompatybilność wsteczna z poprzednim analyze_file
def analyze_file(path: str, ext: str) -> dict:
    filename = os.path.basename(path)
    temp_dir = os.path.dirname(path)
    return process_uploaded_file(path, filename, temp_dir)
