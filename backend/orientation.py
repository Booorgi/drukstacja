"""
Auto-orientacja modelu pod druk 3D.

Prawdziwe slicery (PrusaSlicer, Cura) maja przycisk "Optimize orientation" /
"Lay flat", ktory obraca model tak, aby zminimalizowac powierzchnie nawisow
(a wiec ilosc potrzebnych podpor) i/lub wysokosc wydruku.

PrusaSlicer w trybie CLI (linia komend, ktorego uzywamy w slicer.py) NIE MA
takiej automatycznej optymalizacji - trzeba ja policzyc samemu PRZED wyslaniem
pliku do PrusaSlicer-a, a nastepnie fizycznie obrocic siatke i wyeksportowac
nowy plik STL w tej orientacji. Dokladnie to robi ponizszy modul.

Algorytm (uproszczona wersja podejscia znanego z projektu "Tweaker"):
1. Sprawdz 6 orientacji osiowych (X/Y/Z +/-). Nie uzywamy scian hull -
   te potrafia polozyc model "pod katem" na stole, mimo ze w CAD lezal plasko.
2. Dla kazdej kandydatki obroc siatke tak, aby dana os ladawala sie
   plasko na stole (Z = min).
3. Policz "koszt podpor": sume powierzchni trojkatow nachylonych wzgledem
   stolu ponizej progu (domyslnie 30 stopni, jak w Bambu Studio) - to sa
   dokladnie te powierzchnie, pod ktore slicer wstawi podpory.
4. Wybierz orientacje z najnizszym kosztem (tie-break: nizsza bryla = krotszy
   czas druku, wieksza podstawa = lepsza przyczepnosc do stolu).
"""
import numpy as np
import trimesh

# Prog podpor taki jak w Bambu Studio / OrcaSlicer ("Threshold angle" = 30):
# podpory powstaja dla nawisow, ktorych kat nachylenia wzgledem stolu jest
# PONIZEJ progu (90 stopni = pionowa scianka, 0 stopni = plaski sufit).
SUPPORT_THRESHOLD_ANGLE_DEG = 30.0
DENSE_MESH_FACES = 20000
SAMPLE_FACES = 8000
AXIS_NORMALS = np.array(
    [
        [1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, -1.0],
    ],
    dtype=float,
)


def _cheap_sample_mesh(mesh: trimesh.Trimesh, max_faces: int = SAMPLE_FACES) -> trimesh.Trimesh:
    """Równomierna próbka ścianek bez quadric decimation (to wisi na gęstych 3MF)."""
    n = int(mesh.faces.shape[0])
    if n <= max_faces:
        return mesh
    idx = np.linspace(0, n - 1, max_faces, dtype=int)
    return trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces[idx], process=False)


def _rotation_to_place_face_down(normal: np.ndarray) -> np.ndarray:
    """Macierz obrotu 4x4, ktora uklada wskazana normalna scienia w dol (na -Z)."""
    target = np.array([0.0, 0.0, -1.0])
    return trimesh.geometry.align_vectors(normal, target)


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


def auto_orient_mesh(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, dict]:
    """
    Zwraca (obrocona_siatka, info) - siatke ustawiona w orientacji
    minimalizujacej powierzchnie nawisow, gotowa do wyslania do slicera.
    """
    if mesh.faces.shape[0] == 0:
        return mesh, {"rotated": False, "reason": "empty_mesh"}

    n_faces = int(mesh.faces.shape[0])
    dense = n_faces > DENSE_MESH_FACES
    eval_mesh = _cheap_sample_mesh(mesh, SAMPLE_FACES) if dense else mesh
    candidates = AXIS_NORMALS
    mode = "axis_sample" if dense else "axis"

    # Tolerancja porownania wynikow jako WARTOSC BEZWZGLEDNA (nie procent!) -
    # przy idealnym wyniku 0.0 (brak nawisow) procentowa tolerancja typu
    # "score < best_score * 1.02" zawsze daje 0, wiec nigdy by sie nie
    # uruchomil tie-break po wysokosci. Uzywamy wiec malego ulamka calkowitej
    # powierzchni bryly jako progu "wynikow praktycznie rownych".
    tie_tolerance = max(eval_mesh.area * 0.002, 0.5)

    best_score = None
    best_transform = None
    best_height = None

    for normal in candidates:
        try:
            transform = _rotation_to_place_face_down(normal)
            candidate_mesh = eval_mesh.copy()
            candidate_mesh.apply_transform(transform)

            score = _support_score(candidate_mesh)
            height = candidate_mesh.bounds[1][2] - candidate_mesh.bounds[0][2]

            if best_score is None or score < best_score - tie_tolerance:
                # wyraznie lepszy wynik (mniej podpor)
                best_score, best_transform, best_height = score, transform, height
            elif abs(score - best_score) <= tie_tolerance and height < best_height:
                # praktycznie taki sam wynik podpor -> wybierz nizszy model
                # (krotszy czas druku, lepsza stabilnosc na stole)
                best_score, best_transform, best_height = score, transform, height
        except Exception:
            continue

    if best_transform is None:
        placed = mesh.copy()
        zmin = float(placed.bounds[0][2]) if placed.bounds is not None else 0.0
        T = np.eye(4)
        T[2, 3] = -zmin
        placed.apply_transform(T)
        return placed, {
            "rotated": False,
            "reason": "no_valid_candidate",
            "matrix": T.tolist(),
        }

    oriented = mesh.copy()
    oriented.apply_transform(best_transform)

    # Postaw model dokladnie na stole (Z min = 0) - PrusaSlicer i tak by to
    # zrobil, ale robimy to jawnie, zeby podglad w przegladarce tez byl poprawny
    zmin = float(oriented.bounds[0][2])
    bed_T = np.eye(4)
    bed_T[2, 3] = -zmin
    oriented.apply_transform(bed_T)
    combined = bed_T @ best_transform

    if dense:
        baseline_score = float(best_score)
        improvement_pct = 0.0
    else:
        baseline_score = _support_score(mesh)
        improvement_pct = 0.0
        if baseline_score > 0:
            improvement_pct = round((1 - best_score / baseline_score) * 100, 1)

    return oriented, {
        "rotated": True,
        "support_score_before": round(baseline_score, 2),
        "support_score_after": round(best_score, 2),
        "improvement_pct": improvement_pct,
        "candidates_tested": len(candidates),
        "mode": mode,
        "triangle_count": n_faces,
        "matrix": combined.tolist(),
    }
