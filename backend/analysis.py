"""
Analiza geometrii plikow CAD.
- STL/OBJ: siatka trojkatow -> trimesh (szybkie, lekkie)
- STEP/STP: prawdziwa bryla CAD -> cadquery/OCP (wolniejsze, ciezsze, ale dokladne)
"""
import trimesh


class UnsupportedFileType(Exception):
    pass


def analyze_mesh_file(path: str) -> dict:
    """STL / OBJ - siatka trojkatow."""
    mesh = trimesh.load(path, force="mesh")

    if not mesh.is_watertight:
        # Model nieszczelny - objetosc moze byc niedokladna.
        # Warto to pokazac userowi jako ostrzezenie w UI.
        watertight = False
    else:
        watertight = True

    volume_mm3 = abs(mesh.volume)  # trimesh liczy w jednostkach pliku (zwykle mm dla druku 3D)
    bbox = mesh.bounding_box.extents  # [x, y, z] w mm

    return {
        "volume_cm3": round(volume_mm3 / 1000, 3),
        "bbox_mm": [round(float(v), 2) for v in bbox],
        "surface_area_cm2": round(mesh.area / 100, 2),
        "watertight": watertight,
        "triangle_count": len(mesh.faces),
    }


def analyze_step_file(path: str) -> dict:
    """STEP / STP - prawdziwa bryla CAD."""
    import cadquery as cq

    result = cq.importers.importStep(path)
    solid = result.val()

    volume_mm3 = solid.Volume()
    bbox = solid.BoundingBox()

    return {
        "volume_cm3": round(volume_mm3 / 1000, 3),
        "bbox_mm": [
            round(bbox.xlen, 2),
            round(bbox.ylen, 2),
            round(bbox.zlen, 2),
        ],
        "surface_area_cm2": round(solid.Area() / 100, 2),
        "watertight": True,  # bryla CAD z definicji jest zamknieta
        "triangle_count": None,
    }


def analyze_file(path: str, ext: str) -> dict:
    if ext in (".stl", ".obj"):
        data = analyze_mesh_file(path)
        data["file_type"] = "mesh"
    elif ext in (".step", ".stp"):
        data = analyze_step_file(path)
        data["file_type"] = "cad_solid"
    else:
        raise UnsupportedFileType(f"Format {ext} nieobslugiwany")

    return data
