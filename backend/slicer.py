import subprocess
import re
import os
import math
import shutil
import tempfile
from pathlib import Path
import trimesh
import numpy as np

from orientation import SUPPORT_THRESHOLD_ANGLE_DEG, _support_score

try:
    import cadquery as cq
except Exception:
    cq = None

# Gęstości tworzyw w g/cm3 do przeliczania masy i długości filamentu 1.75mm
FILAMENT_DENSITIES = {
    "PLA": 1.24,
    "PLA Silk": 1.24,
    "PLA Matte": 1.24,
    "PETG": 1.27,
    "PETG FR": 1.29,
    "PETG_FR": 1.29,
    "PCTG": 1.23,
    "ABS": 1.05,
    "ASA": 1.07,
    "TPU": 1.21,
    "FLEX": 1.21,
    "PP": 0.90,
    "PA12 CF": 1.15,
    "PA12_CF": 1.15,
    "PA-CF": 1.15,
    "PETG-CF": 1.30,
    "PLA-CF": 1.28,
}

# Profile temperaturowe i chłodzenia dla slicera
MATERIAL_PROFILES = {
    "PLA": {"temp": 215, "bed_temp": 60, "fan": 100},
    "PLA Silk": {"temp": 220, "bed_temp": 60, "fan": 100},
    "PLA Matte": {"temp": 215, "bed_temp": 60, "fan": 100},
    "PETG": {"temp": 235, "bed_temp": 75, "fan": 50},
    "PETG FR": {"temp": 245, "bed_temp": 80, "fan": 40},
    "PETG_FR": {"temp": 245, "bed_temp": 80, "fan": 40},
    "PCTG": {"temp": 240, "bed_temp": 75, "fan": 40},
    "ABS": {"temp": 245, "bed_temp": 100, "fan": 15},
    "ASA": {"temp": 250, "bed_temp": 100, "fan": 20},
    "PA12 CF": {"temp": 280, "bed_temp": 100, "fan": 10},
    "PA12_CF": {"temp": 280, "bed_temp": 100, "fan": 10},
    "PA-CF": {"temp": 280, "bed_temp": 100, "fan": 10},
    "TPU": {"temp": 220, "bed_temp": 50, "fan": 80},
    "PP": {"temp": 225, "bed_temp": 85, "fan": 50},
}


def get_filament_density(filament_type: str) -> float:
    """Zwraca gęstość w g/cm3 dla danego tworzywa."""
    name_clean = str(filament_type or "").upper().replace("_", " ").replace("-", " ")
    for k, v in sorted(FILAMENT_DENSITIES.items(), key=lambda x: len(x[0]), reverse=True):
        clean_k = k.upper().replace("_", " ").replace("-", " ")
        if clean_k in name_clean:
            return v
    return 1.24


def get_material_profile(filament_type: str) -> dict:
    """Zwraca profil temperaturowy dla danego filamentu."""
    name_clean = str(filament_type or "").upper().replace("_", " ").replace("-", " ")
    for k, v in sorted(MATERIAL_PROFILES.items(), key=lambda x: len(x[0]), reverse=True):
        clean_k = k.upper().replace("_", " ").replace("-", " ")
        if clean_k in name_clean:
            return v
    return MATERIAL_PROFILES["PLA"]


def convert_step_to_stl(step_path: str, output_stl_path: str) -> str:
    """Wczytuje model STEP przez CadQuery i eksportuje jako siatkę STL."""
    if cq is None:
        raise RuntimeError("CadQuery nie jest zainstalowane w tym środowisku.")
    result = cq.importers.importStep(step_path)
    cq.exporters.export(result, output_stl_path, tolerance=0.1, angularTolerance=0.2)
    return output_stl_path


def get_slicer_binary() -> str | None:
    """Wyszukuje binarkę prusa-slicer w systemie."""
    binary = shutil.which("prusa-slicer")
    if binary:
        return binary
    for fallback in [
        "/usr/bin/prusa-slicer",
        "/usr/local/bin/prusa-slicer",
        "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe",
        "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe",
    ]:
        if os.path.isfile(fallback) and (os.access(fallback, os.X_OK) or fallback.endswith(".exe")):
            return fallback
    return None


def parse_time_to_hours(time_str: str) -> tuple[float, str]:
    """
    Parsuje czas druku z formatów slicerów:
    - PrusaSlicer: '2h 35m 12s', '45m 30s', '1d 3h 15m'
    - Cura / RepRap: ';TIME:9312' (w sekundach)
    Zwraca (hours: float, formatted_str: str)
    """
    if not time_str:
        return 0.0, "0m"

    time_str = time_str.strip()

    # Przypadek sekund (np. Cura ;TIME:9312)
    if time_str.isdigit():
        total_seconds = int(time_str)
    else:
        d_m = re.search(r"(\d+)\s*d", time_str)
        h_m = re.search(r"(\d+)\s*h", time_str)
        m_m = re.search(r"(\d+)\s*m", time_str)
        s_m = re.search(r"(\d+)\s*s", time_str)

        days = int(d_m.group(1)) if d_m else 0
        hours = int(h_m.group(1)) if h_m else 0
        minutes = int(m_m.group(1)) if m_m else 0
        seconds = int(s_m.group(1)) if s_m else 0

        total_seconds = days * 86400 + hours * 3600 + minutes * 60 + seconds

    hours_float = round(total_seconds / 3600.0, 2)

    if total_seconds >= 86400:
        d_part = total_seconds // 86400
        h_part = (total_seconds % 86400) // 3600
        m_part = (total_seconds % 3600) // 60
        formatted = f"{d_part}d {h_part}h {m_part}m"
    elif total_seconds >= 3600:
        h_part = total_seconds // 3600
        m_part = (total_seconds % 3600) // 60
        formatted = f"{h_part}h {m_part}m"
    elif total_seconds >= 60:
        formatted = f"{total_seconds // 60}m"
    else:
        formatted = f"{total_seconds}s"

    return hours_float, formatted


def extract_support_segments(gcode_path: str, bed_center: tuple[float, float]) -> list[float]:
    """
    Parsuje G-Code i wyciąga współrzędne podpór organicznych,
    odejmując środek stołu/obiektu, na którym slicer umieścił wydruk.
    """
    raw_segments = []
    is_support = False
    cur_x, cur_y, cur_z = None, None, None

    with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()

            if line.startswith(";TYPE:Support material"):
                is_support = True
                continue
            elif line.startswith(";TYPE:"):
                is_support = False
                continue

            if line.startswith("G1") or line.startswith("G0"):
                x_m = re.search(r"X([\d\.-]+)", line)
                y_m = re.search(r"Y([\d\.-]+)", line)
                z_m = re.search(r"Z([\d\.-]+)", line)
                e_m = re.search(r"E([\d\.-]+)", line)

                new_x = float(x_m.group(1)) if x_m else cur_x
                new_y = float(y_m.group(1)) if y_m else cur_y
                new_z = float(z_m.group(1)) if z_m else cur_z

                if (
                    is_support
                    and e_m
                    and cur_x is not None
                    and cur_y is not None
                    and (new_x != cur_x or new_y != cur_y)
                ):
                    raw_segments.extend([cur_x, cur_y, cur_z or 0.2, new_x, new_y, new_z or 0.2])

                cur_x, cur_y, cur_z = new_x, new_y, new_z

    if not raw_segments:
        return []

    ref_x, ref_y = bed_center

    formatted = []
    step = 6 if len(raw_segments) <= 150000 else 12

    for i in range(0, len(raw_segments), step):
        gx1, gy1, gz1 = raw_segments[i], raw_segments[i+1], raw_segments[i+2]
        gx2, gy2, gz2 = raw_segments[i+3], raw_segments[i+4], raw_segments[i+5]

        formatted.extend([
            round(gx1 - ref_x, 2), round(gy1 - ref_y, 2), round(gz1, 2),
            round(gx2 - ref_x, 2), round(gy2 - ref_y, 2), round(gz2, 2)
        ])

    return formatted


def estimate_filament_from_geometry(
    volume_cm3: float,
    surface_area_cm2: float,
    dimensions_mm,
    infill: int = 20,
    layer_height: float = 0.20,
    nozzle_size: float = 0.4,
    filament_type: str = "PLA",
    support_needed: bool = False,
    color_count: int = 1,
    painted_ratio: float = 0.0,
) -> dict:
    """
    Szacunek zużycia filamentu z geometrii, bez pełnego G-code.

    Stary wzór (72% objętości jako ścianki × 1.42) był skalibrowany pod małe
    obudowy i na rzeźbach typu Jaguar (842 cm³) dawał ~1150 g / 55 h, podczas
    gdy Bambu Studio na tym samym pliku liczy ~518 g / 28 h (model + podpory
    + spłukiwanie AMS).

    Tutaj:
    - ścianki z powierzchni * grubość (3 obrysy),
    - góra/dół z przekroju * liczba warstw,
    - infill tylko na pozostałe wnętrze,
    - przy wielu kolorach AMS: grubsza skorupa (Ensure vertical shell thickness)
      oraz spłukiwanie i wieża jak w Bambu.
    """
    density = get_filament_density(filament_type)
    volume_cm3 = max(0.01, float(volume_cm3))
    infill = max(0, min(100, int(infill)))
    layer_height = max(0.05, float(layer_height or 0.20))
    nozzle_size = max(0.1, float(nozzle_size or 0.4))
    color_count = max(1, int(color_count or 1))
    painted_ratio = min(1.0, max(0.0, float(painted_ratio or 0.0)))
    # Malowany 3MF przy błędnie podanym 1 kolorze i tak musi doliczyć AMS.
    if painted_ratio >= 0.05:
        color_count = max(color_count, 2)

    dims = [float(v) for v in (dimensions_mm or [])]
    while len(dims) < 3:
        dims.append(40.0)
    height_mm = max(dims[2], layer_height)

    wall_width_mm = nozzle_size * 1.1
    wall_loops = 3
    shell_thickness_mm = wall_loops * wall_width_mm
    surface_mm2 = max(0.0, float(surface_area_cm2 or 0.0)) * 100.0
    if surface_mm2 <= 0.0:
        # Brak siatki: przybliż powierzchnię ze skali bryły w prostopadłościanie.
        bbox_vol = max(dims[0] * dims[1] * dims[2], 1.0)
        fill = min(1.0, (volume_cm3 * 1000.0) / bbox_vol)
        box_sa = 2.0 * (dims[0] * dims[1] + dims[0] * dims[2] + dims[1] * dims[2])
        surface_mm2 = box_sa * (fill ** (2.0 / 3.0))

    shell_cm3 = (surface_mm2 * shell_thickness_mm) / 1000.0
    # Bambu na malowanych rzeźbach dogęszcza pionowe ścianki (Jaguar przy 5%
    # infill i tak ma ~338 g modelu, nie ~200 g z samych 3 obrysów).
    if color_count >= 2:
        shell_cm3 *= 1.96
    shell_cm3 = min(shell_cm3, volume_cm3 * 0.90)

    avg_cross_mm2 = (volume_cm3 * 1000.0) / height_mm
    bbox_xy = dims[0] * dims[1]
    proj_mm2 = min(avg_cross_mm2, bbox_xy * 0.65) if bbox_xy > 0 else avg_cross_mm2
    top_bottom_mm = (5 + 4) * layer_height
    tb_cm3 = (proj_mm2 * top_bottom_mm) / 1000.0
    remaining_after_shell = max(0.0, volume_cm3 - shell_cm3)
    tb_cm3 = min(tb_cm3, remaining_after_shell * 0.80)

    interior_cm3 = max(0.0, volume_cm3 - shell_cm3 - tb_cm3)
    infill_cm3 = interior_cm3 * (infill / 100.0)
    model_cm3 = shell_cm3 + tb_cm3 + infill_cm3

    # Linia startowa / priming - stała, nie procent od całej bryły.
    model_cm3 += 0.70

    support_cm3 = 0.0
    if support_needed:
        # Bambu na Jaguarze: 10.3 g podpor przy ~338 g modelu ≈ 3% masy modelu.
        support_cm3 = model_cm3 * 0.038

    flush_cm3 = 0.0
    tower_cm3 = 0.0
    num_layers = max(1, int(height_mm / layer_height))
    if color_count >= 2:
        # Bambu Jaguar: 414 zmian / 387 warstw. Im gęstsze malowanie, tym więcej zmian.
        base = 0.35 * (color_count - 1)
        painted = painted_ratio * (color_count - 1) * 0.55
        painted_complexity = min(float(color_count - 1), max(base, painted, 0.9))
        toolchanges = num_layers * painted_complexity
        flush_cm3 = (toolchanges * 0.32) / max(density, 0.01)  # ~0.32 g na zmianę
        tower_cm3 = (num_layers * 0.105) / max(density, 0.01)  # ~0.10 g na warstwę wieży

    effective_cm3 = model_cm3 + support_cm3 + flush_cm3 + tower_cm3
    filament_weight_g = round(effective_cm3 * density, 1)
    filament_length_m = round(
        (effective_cm3 * 1000.0) / (math.pi * (1.75 / 2.0) ** 2 * 1000.0),
        2,
    )

    # Bambu A1 / 0.4 mm / 0.20 mm na tym modelu: ~15–16 cm³/h łącznie ze spłukiwaniem.
    is_nozzle_02 = abs(nozzle_size - 0.2) < 0.05
    mm3_per_hour = 6500.0 if is_nozzle_02 else 16000.0
    if color_count >= 2:
        mm3_per_hour *= 0.96  # postoje na zmiany AMS
    extrusion_hours = (effective_cm3 * 1000.0) / mm3_per_hour
    layer_overhead_hours = num_layers * (0.0018 if is_nozzle_02 else 0.0012)
    total_hours = round(extrusion_hours + layer_overhead_hours, 2)
    hours_float, print_time_formatted = parse_time_to_hours(str(int(total_hours * 3600)))

    return {
        "filament_weight_g": filament_weight_g,
        "filament_length_m": filament_length_m,
        "filament_volume_cm3": round(effective_cm3, 2),
        "print_time_hours": hours_float,
        "print_time_formatted": print_time_formatted,
        "has_supports": bool(support_needed),
        "model_cm3": round(model_cm3, 2),
        "support_cm3": round(support_cm3, 2),
        "flush_cm3": round(flush_cm3 + tower_cm3, 2),
    }


def simulate_slicing_fallback(
    stl_path: str,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    nozzle_size: float = 0.4,
    color_count: int = 1,
    support_needed: bool | None = None,
    painted_ratio: float = 0.0,
) -> dict:
    """
    Fallback, gdy na hoście nie ma PrusaSlicera. Liczy zużycie z geometrii siatki
    (ścianki z powierzchni, infill z wnętrza, AMS jeśli plik ma kilka kolorów).
    """
    volume_cm3 = 30.0
    surface_area_cm2 = 0.0
    dimensions_mm = [40.0, 40.0, 40.0]
    inferred_supports = False

    try:
        ext = Path(stl_path).suffix.lower()
        if ext == ".3mf":
            from analysis import load_3mf_mesh
            mesh = load_3mf_mesh(stl_path)
        else:
            loaded = trimesh.load(stl_path)
            if isinstance(loaded, trimesh.Scene):
                valid_geoms = [
                    g for g in loaded.geometry.values()
                    if hasattr(g, "faces") and len(g.faces) > 0
                ]
                if valid_geoms:
                    try:
                        mesh = loaded.to_geometry()
                        if not isinstance(mesh, trimesh.Trimesh):
                            mesh = trimesh.util.concatenate(list(valid_geoms))
                    except Exception:
                        mesh = trimesh.util.concatenate(list(valid_geoms))
                else:
                    mesh = loaded
            else:
                mesh = loaded

        if not isinstance(mesh, trimesh.Trimesh):
            mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces)

        bbox = mesh.bounding_box.extents
        bbox_volume = float(np.prod(bbox)) if len(bbox) == 3 else 1e9
        if mesh.volume and not np.isnan(mesh.volume) and abs(mesh.volume) > 0:
            if abs(mesh.volume) <= bbox_volume * 1.05:
                volume_cm3 = abs(float(mesh.volume)) / 1000.0
        if hasattr(mesh, "area") and mesh.area:
            surface_area_cm2 = float(mesh.area) / 100.0
        dimensions_mm = [round(float(v), 2) for v in bbox]

        if support_needed is None:
            try:
                inferred_supports = _support_score(mesh) > 5.0
            except Exception:
                inferred_supports = False
    except Exception as e:
        print(f"[WARN] Fallback mesh load error: {e}")

    if support_needed is None:
        support_needed = inferred_supports

    est = estimate_filament_from_geometry(
        volume_cm3=volume_cm3,
        surface_area_cm2=surface_area_cm2,
        dimensions_mm=dimensions_mm,
        infill=infill,
        layer_height=layer_height,
        nozzle_size=nozzle_size,
        filament_type=filament_type,
        support_needed=bool(support_needed),
        color_count=color_count,
        painted_ratio=painted_ratio,
    )

    return {
        "success": True,
        "engine": "geometry-estimate",
        "print_time_hours": est["print_time_hours"],
        "print_time_formatted": est["print_time_formatted"],
        "filament_weight_g": est["filament_weight_g"],
        "filament_length_m": est["filament_length_m"],
        "filament_volume_cm3": est["filament_volume_cm3"],
        "layer_height": layer_height,
        "nozzle_size": nozzle_size,
        "infill": infill,
        "filament_type": filament_type,
        "has_supports": est["has_supports"],
        "support_lines": [],
        "model_cm3": est.get("model_cm3"),
        "support_cm3": est.get("support_cm3"),
        "flush_cm3": est.get("flush_cm3"),
        "color_count": color_count,
    }


DENSE_SLICE_FACES = 80000
DENSE_STL_BYTES = 18 * 1024 * 1024


def slice_result_from_bambu_stats(
    stats: dict,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    nozzle_size: float = 0.4,
) -> dict:
    """Wycena z Metadata/slice_info.config — to te same liczby co w Bambu Studio."""
    weight = float(stats.get("filament_weight_g") or 0)
    length = float(stats.get("filament_length_m") or 0)
    seconds = int(stats.get("print_time_seconds") or 0)
    density = get_filament_density(filament_type)
    if length <= 0 and weight > 0:
        volume_cm3 = weight / max(density, 0.01)
        length = round((volume_cm3 * 1000.0) / (math.pi * (1.75 / 2.0) ** 2 * 1000.0), 2)
    if seconds <= 0 and weight > 0:
        seconds = int(round((weight / max(density, 0.01) * 1000.0) / 16000.0 * 3600))
    hours_float, time_formatted = parse_time_to_hours(str(max(seconds, 0)))
    volume_cm3 = round(weight / max(density, 0.01), 2) if weight else 0.0
    return {
        "success": True,
        "engine": "bambu-slice-info",
        "print_time_hours": hours_float,
        "print_time_formatted": time_formatted,
        "filament_weight_g": round(weight, 1),
        "filament_length_m": round(length, 2),
        "filament_volume_cm3": volume_cm3,
        "layer_height": layer_height,
        "nozzle_size": nozzle_size,
        "infill": infill,
        "filament_type": filament_type,
        "has_supports": True,
        "support_lines": [],
        "flush_cm3": float(stats.get("flush_cm3") or 0),
        "support_cm3": float(stats.get("support_cm3") or 0),
        "color_count": int(stats.get("color_count") or 1),
    }


def is_dense_slice_job(stl_path: str, triangle_count=None) -> bool:
    """PrusaSlicer na Jaguarze (~76 MB STL) latwo przekracza 60 s limitu proxy."""
    if triangle_count is not None and int(triangle_count) >= DENSE_SLICE_FACES:
        return True
    try:
        return os.path.getsize(stl_path) >= DENSE_STL_BYTES
    except OSError:
        return False


def slice_result_from_geometry(
    volume_cm3: float,
    surface_area_cm2: float,
    dimensions_mm,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    nozzle_size: float = 0.4,
    color_count: int = 1,
    support_needed: bool = True,
    painted_ratio: float = 0.0,
) -> dict:
    est = estimate_filament_from_geometry(
        volume_cm3=volume_cm3,
        surface_area_cm2=surface_area_cm2,
        dimensions_mm=dimensions_mm,
        infill=infill,
        layer_height=layer_height,
        nozzle_size=nozzle_size,
        filament_type=filament_type,
        support_needed=bool(support_needed),
        color_count=color_count,
        painted_ratio=painted_ratio,
    )
    return {
        "success": True,
        "engine": "geometry-estimate",
        "print_time_hours": est["print_time_hours"],
        "print_time_formatted": est["print_time_formatted"],
        "filament_weight_g": est["filament_weight_g"],
        "filament_length_m": est["filament_length_m"],
        "filament_volume_cm3": est["filament_volume_cm3"],
        "layer_height": layer_height,
        "nozzle_size": nozzle_size,
        "infill": infill,
        "filament_type": filament_type,
        "has_supports": est["has_supports"],
        "support_lines": [],
        "model_cm3": est.get("model_cm3"),
        "support_cm3": est.get("support_cm3"),
        "flush_cm3": est.get("flush_cm3"),
        "color_count": color_count,
    }


def run_slicer(
    stl_path: str,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    support_material: bool = True,
    nozzle_size: float = 0.4,
    color_count: int = 1,
    support_needed: bool | None = None,
    painted_ratio: float = 0.0,
    triangle_count=None,
    volume_cm3=None,
    surface_area_cm2=None,
    dimensions_mm=None,
) -> dict:
    """
    Uruchamia natywny proces slicera (PrusaSlicer CLI) na pliku STL,
    parsuje wygenerowany G-Code i zwraca dokładne metadane czasu i zużycia filamentu.
    Jeśli PrusaSlicer nie jest dostępny, przełącza się automatycznie na fallback.
    Gęste siatki 3MF idą od razu na szacunek z geometrii — CLI i tak nie wraca przed timeoutem.
    """
    if is_dense_slice_job(stl_path, triangle_count):
        if volume_cm3 is not None:
            return slice_result_from_geometry(
                volume_cm3=float(volume_cm3),
                surface_area_cm2=float(surface_area_cm2 or 0.0),
                dimensions_mm=dimensions_mm,
                infill=infill,
                layer_height=layer_height,
                filament_type=filament_type,
                nozzle_size=nozzle_size,
                color_count=color_count,
                support_needed=True if support_needed is None else bool(support_needed),
                painted_ratio=painted_ratio,
            )
        print("[INFO] Gęsta siatka — pomijam PrusaSlicer CLI, liczę z geometrii.")
        return simulate_slicing_fallback(
            stl_path,
            infill=infill,
            layer_height=layer_height,
            filament_type=filament_type,
            nozzle_size=nozzle_size,
            color_count=color_count,
            support_needed=support_needed,
            painted_ratio=painted_ratio,
        )

    slicer_bin = get_slicer_binary()

    if not slicer_bin:
        print("[INFO] PrusaSlicer CLI niedostępny w systemie hosta – używam symulacji inżynieryjnej.")
        return simulate_slicing_fallback(
            stl_path,
            infill=infill,
            layer_height=layer_height,
            filament_type=filament_type,
            nozzle_size=nozzle_size,
            color_count=color_count,
            support_needed=support_needed,
            painted_ratio=painted_ratio,
        )

    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as tmp_gcode:
        gcode_path = tmp_gcode.name

    bed_center = (125.0, 105.0)  # Standardowy środek stołu (250x210 mm)

    try:
        cmd = [
            slicer_bin,
            "--export-gcode",
            f"--fill-density={int(infill)}%",
            f"--layer-height={layer_height}",
            f"--nozzle-diameter={nozzle_size}",
            "--output", gcode_path,
            stl_path
        ]

        profile = get_material_profile(filament_type)
        cmd.extend([
            f"--temperature={profile['temp']}",
            f"--first-layer-temperature={profile['temp']}",
            f"--bed-temperature={profile['bed_temp']}",
            f"--first-layer-bed-temperature={profile['bed_temp']}",
        ])

        if support_material:
            cmd.extend([
                "--support-material",
                "--support-material-auto",
                "--support-material-style=organic",
                f"--support-material-threshold={int(SUPPORT_THRESHOLD_ANGLE_DEG)}",
            ])

        env = os.environ.copy()
        env["DISPLAY"] = ""

        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=90,
        )

        if process.returncode != 0 or not os.path.exists(gcode_path) or os.path.getsize(gcode_path) == 0:
            print(f"[WARN] PrusaSlicer exit code {process.returncode}: {process.stderr[:300]}")
            return simulate_slicing_fallback(
                stl_path,
                infill=infill,
                layer_height=layer_height,
                filament_type=filament_type,
                nozzle_size=nozzle_size,
                color_count=color_count,
                support_needed=support_needed,
                painted_ratio=painted_ratio,
            )

        # PARSOWANIE G-CODE
        print_time_str = None
        filament_g = 0.0
        filament_m = 0.0
        filament_cm3 = 0.0
        has_supports = False
        support_lines = []

        with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

            # 1. Czas druku
            time_match = re.search(r"; estimated printing time.*?=\s*([^\r\n]+)", content)
            if time_match:
                print_time_str = time_match.group(1).strip()
            else:
                # Sprawdzenie formatu Cura
                cura_time = re.search(r";TIME:\s*(\d+)", content)
                if cura_time:
                    print_time_str = cura_time.group(1)

            # 2. Waga filamentu [g]
            weight_match = re.search(r"; filament used \[g\]\s*=\s*([\d\.]+)", content)
            if weight_match:
                filament_g = round(float(weight_match.group(1)), 2)

            # 3. Długość filamentu [mm] -> zamiana na metry
            length_match = re.search(r"; filament used \[mm\]\s*=\s*([\d\.]+)", content)
            if length_match:
                filament_m = round(float(length_match.group(1)) / 1000.0, 2)
            else:
                # Alternatywny zapis metrowy
                m_match = re.search(r";\s*Filament used:\s*([\d\.]+)\s*m", content)
                if m_match:
                    filament_m = round(float(m_match.group(1)), 2)

            # 4. Objętość filamentu [cm3]
            vol_match = re.search(r"; filament used \[cm3\]\s*=\s*([\d\.]+)", content)
            if vol_match:
                filament_cm3 = round(float(vol_match.group(1)), 2)

            # 5. Geometria stołu
            bed_match = re.search(r"; bed_shape\s*=\s*([^\r\n]+)", content)
            if bed_match:
                nums = [float(c) for c in re.findall(r"([\d\.]+)", bed_match.group(1))]
                if len(nums) >= 4:
                    bed_center = (max(nums) / 2.0, max(nums[1::2]) / 2.0)

            if "TYPE:Support material" in content:
                has_supports = True

        if has_supports and support_material:
            support_lines = extract_support_segments(gcode_path, bed_center)

        hours_float, time_formatted = parse_time_to_hours(print_time_str or "")

        # Jeśli slicer nie wygenerował wagi, policz z objętości lub długości
        if filament_g <= 0.0 and filament_cm3 > 0.0:
            density = get_filament_density(filament_type)
            filament_g = round(filament_cm3 * density, 1)

        return {
            "success": True,
            "engine": "prusa-slicer-cli",
            "print_time_hours": hours_float,
            "print_time_formatted": time_formatted,
            "filament_weight_g": filament_g,
            "filament_length_m": filament_m,
            "filament_volume_cm3": filament_cm3,
            "layer_height": layer_height,
            "nozzle_size": nozzle_size,
            "infill": infill,
            "filament_type": filament_type,
            "has_supports": has_supports,
            "support_lines": support_lines,
        }

    except Exception as e:
        print(f"[WARN] Błąd wykonania slicera CLI: {e} – przejście na fallback.")
        return simulate_slicing_fallback(
            stl_path,
            infill=infill,
            layer_height=layer_height,
            filament_type=filament_type,
            nozzle_size=nozzle_size,
            color_count=color_count,
            support_needed=support_needed,
            painted_ratio=painted_ratio,
        )

    finally:
        if os.path.exists(gcode_path):
            try:
                os.remove(gcode_path)
            except Exception:
                pass
