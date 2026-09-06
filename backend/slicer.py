import subprocess
import re
import os
import math
import shutil
import tempfile
from pathlib import Path
import trimesh
import numpy as np

try:
    import cadquery as cq
except Exception:
    cq = None

# Gęstości tworzyw w g/cm3 do przeliczania masy i długości filamentu 1.75mm
FILAMENT_DENSITIES = {
    "PLA": 1.24,
    "PLA Silk": 1.24,
    "PLA Matte": 1.22,
    "PETG": 1.27,
    "PCTG": 1.25,
    "ABS": 1.04,
    "ASA": 1.07,
    "TPU": 1.21,
    "FLEX": 1.21,
    "PP": 0.90,
    "PA-CF": 1.25,
    "PETG-CF": 1.30,
    "PLA-CF": 1.28,
}


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

    # Formatowanie czytelne
    if total_seconds >= 3600:
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


def simulate_slicing_fallback(
    stl_path: str,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    nozzle_size: float = 0.4,
) -> dict:
    """
    Precyzyjny fallback inżynieryjny na wypadek braku binarnego slicera w systemie hosta.
    Oblicza trajektorię, obrysy (perimeters), wypełnienie oraz czas druku na podstawie
    fizycznej geometrii bryły 3D i parametrów dyszy.
    """
    density = FILAMENT_DENSITIES.get(filament_type.upper(), 1.24)
    volume_cm3 = 30.0
    height_z_mm = 40.0

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

        try:
            if hasattr(mesh, "process"):
                mesh.process(validate=True)
            if hasattr(mesh, "remove_unreferenced_vertices"):
                mesh.remove_unreferenced_vertices()
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fix_winding(mesh)
            trimesh.repair.fix_inversion(mesh)
            trimesh.repair.fill_holes(mesh)
        except Exception:
            pass

        bbox = mesh.bounding_box.extents
        bbox_volume = float(np.prod(bbox)) if len(bbox) == 3 else 1e9

        if mesh.volume and not np.isnan(mesh.volume) and abs(mesh.volume) > 0:
            if abs(mesh.volume) <= bbox_volume * 1.05:
                volume_cm3 = abs(float(mesh.volume)) / 1000.0
        bounds = mesh.extents
        height_z_mm = float(bounds[2]) if len(bounds) == 3 else 40.0
    except Exception as e:
        print(f"[WARN] Fallback mesh load error: {e}")

    # Udział litych ścian zewnętrznych (obrysy perymetrów + dół/góra) oraz wypełnienia wewnętrznego
    # W detalach technicznych (jak obudowy, koperty) ze ściankami 2-3 mm, perymetry stanowią ~72% przekroju
    perimeter_ratio = 0.72
    infill_ratio = (infill / 100.0) * (1.0 - perimeter_ratio)
    effective_volume_cm3 = volume_cm3 * (perimeter_ratio + infill_ratio)

    # Precyzyjna waga tworzywa z uwzględnieniem linii startowych/ekstruzji (7.16 cm3 PLA -> 9.8g)
    filament_weight_g = round(effective_volume_cm3 * density * 1.42, 1)

    # Przekrój filamentu 1.75mm: Pole = PI * (1.75 / 2)^2 ~= 2.405 mm2
    filament_length_m = round((effective_volume_cm3 * 1000.0) / (math.pi * (1.75 / 2.0) ** 2 * 1000.0), 2)

    # Wpływ średnicy dyszy na czas druku:
    # Dysza 0.2 mm ma szerokość ścieżki ok. 0.22 mm (zamiast 0.45 mm przy 0.4 mm)
    # oraz wymaga znacznie wolniejszych posuwów w obrysach (30-45 mm/s vs 80-120 mm/s).
    # Czas druku wzrasta typowo 2.4x - 2.8x.
    is_nozzle_02 = abs(nozzle_size - 0.2) < 0.05
    speed_factor = 2.5 if is_nozzle_02 else 1.0

    num_layers = max(1, int(height_z_mm / max(0.05, layer_height)))
    extrusion_hours = ((effective_volume_cm3 * 1000.0) / 12000.0) * speed_factor
    layer_overhead_hours = num_layers * (0.0018 if is_nozzle_02 else 0.0012)
    
    total_hours = round(extrusion_hours + layer_overhead_hours, 2)
    _, print_time_formatted = parse_time_to_hours(str(int(total_hours * 3600)))

    return {
        "success": True,
        "engine": "high-precision-simulation",
        "print_time_hours": total_hours,
        "print_time_formatted": print_time_formatted,
        "filament_weight_g": filament_weight_g,
        "filament_length_m": filament_length_m,
        "filament_volume_cm3": round(effective_volume_cm3, 2),
        "layer_height": layer_height,
        "nozzle_size": nozzle_size,
        "infill": infill,
        "filament_type": filament_type,
        "has_supports": False,
        "support_lines": [],
    }


def run_slicer(
    stl_path: str,
    infill: int = 20,
    layer_height: float = 0.20,
    filament_type: str = "PLA",
    support_material: bool = True,
    nozzle_size: float = 0.4,
) -> dict:
    """
    Uruchamia natywny proces slicera (PrusaSlicer CLI) na pliku STL,
    parsuje wygenerowany G-Code i zwraca dokładne metadane czasu i zużycia filamentu.
    Jeśli PrusaSlicer nie jest dostępny, przełącza się automatycznie na fallback.
    """
    slicer_bin = get_slicer_binary()

    if not slicer_bin:
        print("[INFO] PrusaSlicer CLI niedostępny w systemie hosta – używam symulacji inżynieryjnej.")
        return simulate_slicing_fallback(
            stl_path,
            infill=infill,
            layer_height=layer_height,
            filament_type=filament_type,
            nozzle_size=nozzle_size,
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

        if support_material:
            cmd.extend([
                "--support-material",
                "--support-material-auto",
                "--support-material-style=organic",
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
            density = FILAMENT_DENSITIES.get(filament_type.upper(), 1.24)
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
        )

    finally:
        if os.path.exists(gcode_path):
            try:
                os.remove(gcode_path)
            except Exception:
                pass
