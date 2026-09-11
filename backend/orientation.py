"""
Ustawienie modelu na stole podgladu i slicera.

Nie szukamy "najlepszej sciany" z hull ani 6 osi pod katem podpor -
to stawialo plytkie czesci (obudowa zegarka, pierscien) na rancie.
Jesli jedna krawedz AABB jest wyraznie cientsza, ta krawedz staje sie
wysokoscia Z. W przeciwnym razie zostaje orientacja z pliku, a model
spada na Z = 0.
"""
import numpy as np
import trimesh

# Prog podpor taki jak w Bambu Studio / OrcaSlicer ("Threshold angle" = 30):
# podpory powstaja dla nawisow, ktorych kat nachylenia wzgledem stolu jest
# PONIZEJ progu (90 stopni = pionowa scianka, 0 stopni = plaski sufit).
SUPPORT_THRESHOLD_ANGLE_DEG = 30.0


def _support_score(mesh: trimesh.Trimesh) -> float:
    """
    Suma powierzchni trojkatow wymagajacych podpor (nachylenie wzgledem stolu
    ponizej SUPPORT_THRESHOLD_ANGLE_DEG), wazona sila nawisu.
    Nizszy wynik = mniej materialu na podpory.

    WAZNE: trojkaty stykajace sie ze stolem (na samym dole modelu) sa
    WYKLUCZONE z liczenia - one leza na stole, wiec nie potrzebuja podpor,
    bez wzgledu na to w ktora strone patrzy ich normalna. Bez tego wyjatku
    plaska podstawa modelu (normalna prosto w dol) bylaby blednie liczona
    jako "nawis", co potrafilo zaburzyc wybor orientacji.
    """
    normals = mesh.face_normals
    areas = mesh.area_faces
    verts = mesh.vertices
    faces = mesh.faces

    z_min = mesh.bounds[0][2]
    height = max(mesh.bounds[1][2] - z_min, 1e-6)
    bed_epsilon = max(0.05, height * 0.01)  # min. 0.05mm, albo 1% wysokosci bryly

    # Wymagamy, zeby CALA trojkatna scianka (wszystkie 3 wierzcholki) lezala
    # przy stole - nie wystarczy, ze dotyka go jednym wierzcholkiem/krawedzia.
    # Inaczej stozek stykajacy sie z blatem pojedynczym punktem wykluczylby
    # zbocza od kary za nawis, mimo ze wisza w powietrzu.
    face_top_z = verts[faces][:, :, 2].max(axis=1)
    touches_bed = face_top_z <= (z_min + bed_epsilon)

    # downward = cos(kata nachylenia scianki wzgledem stolu), wiec warunek
    # "nachylenie < prog" to po prostu downward > cos(prog).
    cos_threshold = np.cos(np.radians(SUPPORT_THRESHOLD_ANGLE_DEG))
    downward = -normals[:, 2]  # ile normalna "patrzy w dol"; 1.0 = prosto w dol

    needs_support = (downward > cos_threshold) & (~touches_bed)
    severity = np.clip(downward, 0, 1)

    return float(np.sum(areas[needs_support] * severity[needs_support]))


def _drop_to_bed(mesh: trimesh.Trimesh) -> np.ndarray:
    T = np.eye(4)
    zmin = float(mesh.bounds[0][2]) if mesh.bounds is not None else 0.0
    T[2, 3] = -zmin
    return T


def auto_orient_mesh(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, dict]:
    """
    Kladzie model na stole w orientacji pliku.

    Jesli jedna krawedz AABB jest wyraznie cientsza (plytka, pierscien, obudowa
    zegarka), ta krawedz staje sie wysokoscia Z. Nie obracamy na sciany hull
    ani na osie, ktore stawiaja plaski model na rancie.
    """
    if mesh.faces.shape[0] == 0:
        return mesh, {"rotated": False, "reason": "empty_mesh"}

    n_faces = int(mesh.faces.shape[0])
    extents = np.asarray(mesh.extents, dtype=float)
    thin = int(np.argmin(extents))
    ordered = np.sort(extents)
    clearly_flat = ordered[1] > 1e-9 and ordered[0] < ordered[1] * 0.75

    transform = np.eye(4)
    mode = "as_exported"
    if clearly_flat and thin != 2:
        src = np.zeros(3, dtype=float)
        src[thin] = 1.0
        aligned = trimesh.geometry.align_vectors(src, np.array([0.0, 0.0, 1.0]))
        if aligned is not None:
            transform = np.asarray(aligned, dtype=float)
            mode = "aabb_flat"

    oriented = mesh.copy()
    oriented.apply_transform(transform)
    bed_T = _drop_to_bed(oriented)
    oriented.apply_transform(bed_T)
    combined = bed_T @ transform

    return oriented, {
        "rotated": mode != "as_exported",
        "mode": mode,
        "matrix": combined.tolist(),
        "triangle_count": n_faces,
        "support_score_before": round(_support_score(mesh), 2),
        "support_score_after": round(_support_score(oriented), 2),
        "improvement_pct": 0.0,
        "candidates_tested": 1,
    }
