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


def run_slicer(stl_path: str, infill: int = 20, layer_height: float = 0.2) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as tmp_gcode:
        gcode_path = tmp_gcode.name

    slicer_bin = get_slicer_binary()
    bed_center = (125.0, 105.0)  # Standardowy środek stołu MK3/MK4 (250x210)

    try:
        cmd = [
            slicer_bin,
            "--export-gcode",
            "--support-material",
            "--support-material-auto",
            "--support-material-style=organic",  # Podpory organiczne / drzewiaste
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

                # Wykrywamy konfigurację stołu, jeśli została zapisana w G-Code
                bed_match = re.search(r"; bed_shape\s*=\s*([^\r\n]+)", content)
                if bed_match:
                    nums = [float(c) for c in re.findall(r"([\d\.]+)", bed_match.group(1))]
                    if len(nums) >= 4:
                        bed_center = (max(nums) / 2.0, max(nums[1::2]) / 2.0)

                if "TYPE:Support material" in content:
                    has_supports = True

            if has_supports:
                support_lines = extract_support_segments(gcode_path, bed_center)

        return {
            "print_time": print_time_str,
            "filament_g": filament_g,
            "has_supports": has_supports,
            "support_lines": support_lines
        }

    finally:
        if os.path.exists(gcode_path):
            os.remove(gcode_path)
