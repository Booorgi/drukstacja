import subprocess
import re
import os
import tempfile
import cadquery as cq

def convert_step_to_stl(step_path: str, output_stl_path: str) -> str:
    """Wczytuje model STEP przez CadQuery i eksportuje jako siatkę STL."""
    result = cq.importers.importStep(step_path)
    cq.exporters.export(result, output_stl_path, tolerance=0.1, angularTolerance=0.2)
    return output_stl_path

def run_slicer(stl_path: str, infill: int = 20, layer_height: float = 0.2) -> dict:
    """
    Tnie plik STL w CLI i wyciąga dokładny czas, wagę oraz informację o podporach.
    """
    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as tmp_gcode:
        gcode_path = tmp_gcode.name

    try:
        # Prawidłowe argumenty CLI dla PrusaSlicer w trybie headless
        cmd = [
            "prusa-slicer",
            "--export-gcode",
            "--support-material",                       # Włącza kalkulację podpór pod nawisy
            f"--fill-density={int(infill)}%",
            f"--layer-height={layer_height}",
            "--output", gcode_path,
            stl_path
        ]

        result = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )

        if result.returncode != 0:
            print(f"[SLICER STDERR]: {result.stderr}")
            raise RuntimeError(f"Blad slicera: {result.stderr}")

        # Parsowanie wygenerowanego G-Code
        print_time_str = "N/A"
        filament_g = 0.0
        has_supports = False

        if os.path.exists(gcode_path):
            with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    # Szukanie czasu druku (np. 1h 14m 20s)
                    if "estimated printing time" in line:
                        match = re.search(r"=\s*(.*)", line)
                        if match:
                            print_time_str = match.group(1).strip()

                    # Szukanie wagi filamentu w gramach
                    elif "filament used [g]" in line:
                        match = re.search(r"=\s*([\d\.]+)", line)
                        if match:
                            filament_g = round(float(match.group(1)), 2)

                    # Wykrycie, czy slicer wygenerował linie podpór
                    elif "TYPE:Support material" in line:
                        has_supports = True

        return {
            "print_time": print_time_str,
            "filament_g": filament_g,
            "has_supports": has_supports
        }

    finally:
        if os.path.exists(gcode_path):
            os.remove(gcode_path)
