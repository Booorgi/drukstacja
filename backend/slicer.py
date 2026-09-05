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
    Tnie plik STL w CLI z użyciem wirtualnego bufora Xvfb.
    """
    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as tmp_gcode:
        gcode_path = tmp_gcode.name

    try:
        # xvfb-run -a pozwala ominąć błędy braku ekranu GTK na serwerze Linux
        cmd = [
            "xvfb-run", "-a",
            "prusa-slicer",
            "--export-gcode",
            "--support-material",
            "--support-material-auto",
            f"--fill-density={int(infill)}%",
            f"--layer-height={layer_height}",
            "--output", gcode_path,
            stl_path
        ]

        result = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True,
            timeout=45  # zabezpieczenie przed zawieszeniem
        )

        # Sprawdzenie logów
        if result.returncode != 0:
            print(f"[SLICER ERROR CODE {result.returncode}]: {result.stderr}")
            # Jeśli xvfb-run nie jest dostępny, spróbuj bezpośrednio
            cmd_fallback = [
                "prusa-slicer",
                "--export-gcode",
                "--support-material",
                "--support-material-auto",
                f"--fill-density={int(infill)}%",
                f"--layer-height={layer_height}",
                "--output", gcode_path,
                stl_path
            ]
            result = subprocess.run(cmd_fallback, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=45)

        print_time_str = None
        filament_g = 0.0
        has_supports = False

        if os.path.exists(gcode_path) and os.path.getsize(gcode_path) > 0:
            with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

                # Czas druku (np. 1h 12m lub 45m 10s)
                time_match = re.search(r"; estimated printing time.*?=\s*(.*)", content)
                if time_match:
                    print_time_str = time_match.group(1).strip()

                # Waga filamentu
                weight_match = re.search(r"; filament used \[g\]\s*=\s*([\d\.]+)", content)
                if weight_match:
                    filament_g = round(float(weight_match.group(1)), 2)

                # Podpory: czy slicer wygenerował ścieżki supportu
                if "TYPE:Support material" in content or "support material used" in content:
                    has_supports = True

        return {
            "print_time": print_time_str,
            "filament_g": filament_g,
            "has_supports": has_supports
        }

    except Exception as e:
        print(f"[SLICER EXCEPTION]: {e}")
        raise e
    finally:
        if os.path.exists(gcode_path):
            os.remove(gcode_path)
