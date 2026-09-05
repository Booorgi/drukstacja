import subprocess
import re
import os
import shutil
import tempfile
import cadquery as cq

def convert_step_to_stl(step_path: str, output_stl_path: str) -> str:
    """Wczytuje model STEP przez CadQuery i eksportuje jako siatkę STL."""
    result = cq.importers.importStep(step_path)
    cq.exporters.export(result, output_stl_path, tolerance=0.1, angularTolerance=0.2)
    return output_stl_path

def get_slicer_binary() -> str:
    binary = shutil.which("prusa-slicer")
    if binary:
        return binary
    for fallback in ["/usr/bin/prusa-slicer", "/usr/local/bin/prusa-slicer"]:
        if os.path.isfile(fallback) and os.access(fallback, os.X_OK):
            return fallback
    return "prusa-slicer"

def extract_support_segments(gcode_path: str) -> list[float]:
    """
    Parsuje G-Code i wyciąga segmenty linii podpór (X1, Y1, Z1, X2, Y2, Z2)
    przeliczone bezpośrednio na układ współrzędnych Three.js.
    """
    raw_segments = []
    is_support = False
    cur_x, cur_y, cur_z = 0.0, 0.0, 0.0

    with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith(";TYPE:Support material"):
                is_support = True
                continue
            elif line.startswith(";TYPE:"):
                is_support = False
                continue

            if (line.startswith("G1") or line.startswith("G0")) and is_support:
                x_m = re.search(r"X([\d\.-]+)", line)
                y_m = re.search(r"Y([\d\.-]+)", line)
                z_m = re.search(r"Z([\d\.-]+)", line)
                e_m = re.search(r"E([\d\.-]+)", line)

                new_x = float(x_m.group(1)) if x_m else cur_x
                new_y = float(y_m.group(1)) if y_m else cur_y
                new_z = float(z_m.group(1)) if z_m else cur_z

                # Rejestrujemy ruch tylko jeśli następuje ekstruzja filamentu (E)
                if e_m and (new_x != cur_x or new_y != cur_y):
                    raw_segments.extend([cur_x, cur_y, cur_z, new_x, new_y, new_z])

                cur_x, cur_y, cur_z = new_x, new_y, new_z

    if not raw_segments:
        return []

    # Wylicz środek w płaszczyźnie XY, aby idealnie zcentrować podpory z modelem w Three.js
    xs = [raw_segments[i] for i in range(0, len(raw_segments), 3)]
    ys = [raw_segments[i+1] for i in range(0, len(raw_segments), 3)]

    center_x = (min(xs) + max(xs)) / 2.0
    center_y = (min(ys) + max(ys)) / 2.0

    # Przeliczenie osi: 
    # G-code X -> Three.js X
    # G-code Z (wysokość) -> Three.js Y
    # G-code Y -> Three.js Z
    formatted = []
    # Opcjonalne ograniczenie do 25 000 segmentów, aby nie przeciążać sieci przy gigantycznych modelach
    step = 6 if len(raw_segments) <= 150000 else 12

    for i in range(0, len(raw_segments), step):
        gx1, gy1, gz1 = raw_segments[i], raw_segments[i+1], raw_segments[i+2]
        gx2, gy2, gz2 = raw_segments[i+3], raw_segments[i+4], raw_segments[i+5]

        formatted.extend([
            round(gx1 - center_x, 2), round(gz1, 2), round(gy1 - center_y, 2),
            round(gx2 - center_x, 2), round(gz2, 2), round(gy2 - center_y, 2)
        ])

    return formatted

def run_slicer(stl_path: str, infill: int = 20, layer_height: float = 0.2) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as tmp_gcode:
        gcode_path = tmp_gcode.name

    slicer_bin = get_slicer_binary()

    try:
        cmd = [
            slicer_bin,
            "--export-gcode",
            "--support-material",
            "--support-material-auto",
            f"--fill-density={int(infill)}%",
            f"--layer-height={layer_height}",
            "--output", gcode_path,
            stl_path
        ]

        env = os.environ.copy()
        env["DISPLAY"] = ""

        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, timeout=60)

        print_time_str = None
        filament_g = 0.0
        has_supports = False
        support_lines = []

        if os.path.exists(gcode_path) and os.path.getsize(gcode_path) > 0:
            with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                time_match = re.search(r"; estimated printing time.*?=\s*([^\r\n]+)", content)
                if time_match:
                    print_time_str = time_match.group(1).strip()

                weight_match = re.search(r"; filament used \[g\]\s*=\s*([\d\.]+)", content)
                if weight_match:
                    filament_g = round(float(weight_match.group(1)), 2)

                if "TYPE:Support material" in content:
                    has_supports = True

            # Wyciągamy punkty linii podpór
            if has_supports:
                support_lines = extract_support_segments(gcode_path)

        return {
            "print_time": print_time_str,
            "filament_g": filament_g,
            "has_supports": has_supports,
            "support_lines": support_lines
        }

    finally:
        if os.path.exists(gcode_path):
            os.remove(gcode_path)
