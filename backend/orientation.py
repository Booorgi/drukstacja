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
1. Wyznacz zestaw kandydackich orientacji: normalne scian bryly wypuklej
   (convex hull) + normalne scian bounding-boxa (na wypadek modeli z plaskimi
   podstawami, ktore hull moze pominac przy duzej liczbie trojkatow).
2. Dla kazdej kandydatki obroc siatke tak, aby dana sciana laodowala sie
   plasko na stole (Z = min).
3. Policz "koszt podpor": sume powierzchni trojkatow, ktorych normalna
   wskazuje w dol pod katem wiekszym niz prog (domyslnie 45 stopni) - to sa
   dokladnie te powierzchnie, pod ktore slicer wstawi podpory.
4. Wybierz orientacje z najnizszym kosztem (tie-break: nizsza bryla = krotszy
   czas druku, wieksza podstawa = lepsza przyczepnosc do stolu).
"""
import numpy as np
import trimesh

OVERHANG_ANGLE_DEG = 45.0  # standardowy prog nawisu uzywany przez wiekszosc slicerow


def _candidate_normals(mesh: trimesh.Trimesh) -> np.ndarray:
    """Zwraca zestaw unikalnych kierunkow, kazdy testowany jako 'ta sciana na dole'."""
    candidates = []

    try:
        hull = mesh.convex_hull
        candidates.extend(hull.face_normals.tolist())
    except Exception:
        pass

    # Dokladamy 6 kierunkow osiowych (X/Y/Z +/-) jako zabezpieczenie - waznie
    # przy bryłach prostopadloscianopodobnych, gdzie hull moze dac szumiace wyniki
    candidates.extend([
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
    ])

    arr = np.array(candidates, dtype=float)
    arr = arr / np.linalg.norm(arr, axis=1, keepdims=True)

    # Deduplikacja bardzo podobnych kierunkow (zaokraglenie do 2 miejsc)
    rounded = np.round(arr, 2)
    _, unique_idx = np.unique(rounded, axis=0, return_index=True)
    return arr[unique_idx]


def _rotation_to_place_face_down(normal: np.ndarray) -> np.ndarray:
    """Macierz obrotu 4x4, ktora uklada wskazana normalna scienia w dol (na -Z)."""
    target = np.array([0.0, 0.0, -1.0])
    return trimesh.geometry.align_vectors(normal, target)


def _support_score(mesh: trimesh.Trimesh) -> float:
    """
    Suma powierzchni trojkatow wymagajacych podpor (normalna skierowana w dol
    ponizej progu OVERHANG_ANGLE_DEG), wazona sila nawisu.
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

    cos_threshold = np.cos(np.radians(90 - OVERHANG_ANGLE_DEG))
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

    # Dla gęstych siatek (>25k trójkątów) wyznaczamy optymalny kąt na siatce uproszczonej,
    # co skraca czas analizy z 40s do 0.05s i zapobiega timeoutom serwera.
    if mesh.faces.shape[0] > 25000:
        try:
            eval_mesh = mesh.simplify_quadric_decimation(10000)
            if not isinstance(eval_mesh, trimesh.Trimesh) or eval_mesh.faces.shape[0] == 0:
                eval_mesh = mesh
        except Exception:
            eval_mesh = mesh
    else:
        eval_mesh = mesh

    candidates = _candidate_normals(eval_mesh)

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
        return mesh, {"rotated": False, "reason": "no_valid_candidate"}

    oriented = mesh.copy()
    oriented.apply_transform(best_transform)

    # Postaw model dokladnie na stole (Z min = 0) - PrusaSlicer i tak by to
    # zrobil, ale robimy to jawnie, zeby podglad w przegladarce tez byl poprawny
    oriented.apply_translation([0, 0, -oriented.bounds[0][2]])

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
    }
