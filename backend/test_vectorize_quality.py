"""
Jakość wektoryzacji SVG (/vectorize-ai) — bez ścieżki 3MF.

Sprawdza, że przy 4 kolorach pipeline Makerlab-like (Filter Noise=5, Detail=10)
zwraca SVG + kolory i ma wyraźnie mniej mikrowysp niż słaby filtr szumu.
"""
import io
import os
import re
import sys

import cv2
import numpy as np
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import main  # noqa: E402


def _encode_png(bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", bgr)
    assert ok, "Nie udało się zakodować PNG"
    return buf.tobytes()


def make_noisy_poster(width=400, height=400, seed=7) -> bytes:
    """Duże, czyste plamy + sól/pieprz i ziarno — typowy przypadek Makerlab vs nasz szum."""
    rng = np.random.default_rng(seed)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (168, 196, 232)  # jasny beż (BGR)
    cv2.rectangle(img, (0, 0), (width, int(height * 0.28)), (42, 38, 36), -1)  # ciemna kanapa
    cv2.circle(img, (width // 2, int(height * 0.52)), int(width * 0.22), (28, 28, 26), -1)
    cv2.ellipse(
        img,
        (width // 2, int(height * 0.78)),
        (int(width * 0.20), int(height * 0.12)),
        0,
        0,
        360,
        (58, 108, 168),
        -1,
    )
    cv2.circle(img, (int(width * 0.43), int(height * 0.48)), 10, (210, 210, 210), -1)

    n_salt = int(0.09 * width * height)
    ys = rng.integers(0, height, n_salt)
    xs = rng.integers(0, width, n_salt)
    img[ys, xs] = rng.integers(0, 256, (n_salt, 3), dtype=np.uint8)
    grain = rng.normal(0, 22, img.shape)
    img = np.clip(img.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    return _encode_png(img)


def count_svg_subpaths(svg: str) -> int:
    return len(re.findall(r"\bM\s", svg))


def svg_edge_lengths(svg: str) -> list[float]:
    """Długości krawędzi w jednostkach viewBox (0–100). Drzazgi mają długie krawędzie."""
    lengths = []
    for d in re.findall(r'd="([^"]+)"', svg):
        for sub in re.finditer(
            r"M\s+([-\d.]+)\s+([-\d.]+)\s+((?:L\s+[-\d.]+\s+[-\d.]+\s+)*)Z", d
        ):
            pts = [(float(sub.group(1)), float(sub.group(2)))]
            pts += [
                (float(x), float(y))
                for x, y in re.findall(r"L\s+([-\d.]+)\s+([-\d.]+)", sub.group(3))
            ]
            if len(pts) < 2:
                continue
            closed = pts + [pts[0]]
            for (x0, y0), (x1, y1) in zip(closed, closed[1:]):
                lengths.append(float(np.hypot(x1 - x0, y1 - y0)))
    return lengths


def make_organic_photo(width=640, height=480, seed=11) -> bytes:
    """Zdjęciopodobna sylwetka: krzywe, gradient, ziarno — nie same proste plamy."""
    rng = np.random.default_rng(seed)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    yy, xx = np.mgrid[0:height, 0:width]
    img[:, :, 0] = np.clip(150 + 18 * (yy / height), 0, 255)
    img[:, :, 1] = np.clip(188 + 12 * (xx / width), 0, 255)
    img[:, :, 2] = np.clip(228 - 10 * (yy / height), 0, 255)

    cv2.rectangle(img, (0, 0), (width, int(height * 0.30)), (40, 34, 30), -1)
    head = np.zeros((height, width), np.uint8)
    cv2.ellipse(head, (width // 2, int(height * 0.54)), (int(width * 0.20), int(height * 0.24)), 0, 0, 360, 255, -1)
    cv2.ellipse(head, (int(width * 0.36), int(height * 0.38)), (32, 56), -28, 0, 360, 255, -1)
    cv2.ellipse(head, (int(width * 0.64), int(height * 0.38)), (32, 56), 28, 0, 360, 255, -1)
    head = cv2.GaussianBlur(head, (21, 21), 0)
    dark = img.copy()
    dark[:] = (34, 30, 28)
    alpha = (head.astype(np.float32) / 255.0)[..., None]
    img = (img * (1 - alpha) + dark * alpha).astype(np.uint8)

    cv2.ellipse(img, (width // 2, int(height * 0.62)), (int(width * 0.11), int(height * 0.09)), 0, 0, 360, (72, 108, 158), -1)
    cv2.circle(img, (int(width * 0.45), int(height * 0.50)), 9, (16, 16, 14), -1)
    cv2.circle(img, (int(width * 0.55), int(height * 0.50)), 9, (16, 16, 14), -1)
    cv2.circle(img, (int(width * 0.46), int(height * 0.49)), 3, (210, 210, 208), -1)

    grain = rng.normal(0, 14, img.shape)
    img = np.clip(img.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    n = int(0.045 * width * height)
    ys = rng.integers(0, height, n)
    xs = rng.integers(0, width, n)
    img[ys, xs] = rng.integers(0, 256, (n, 3), dtype=np.uint8)
    return _encode_png(img)


def test_vectorize_returns_svg_and_colors():
    png = make_noisy_poster()
    svg, colors = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10
    )
    assert svg.startswith('<svg')
    assert svg.endswith("</svg>")
    assert len(colors) == 4
    assert all(re.fullmatch(r"#[0-9A-F]{6}", c) for c in colors)
    assert 'fill-rule="evenodd"' in svg


def test_filter_noise_removes_micro_islands():
    png = make_noisy_poster()
    svg_clean, _, dbg_clean = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10, _debug=True
    )
    svg_raw, _, dbg_raw = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=0, detail=10, _debug=True
    )
    assert dbg_clean["islands"] < dbg_raw["islands"], (
        f"Filter Noise=5 powinno dać mniej wysp niż 0 "
        f"({dbg_clean['islands']} vs {dbg_raw['islands']})"
    )
    assert dbg_clean["small_islands"] < dbg_raw["small_islands"]
    assert dbg_clean["islands"] <= 12, f"Zbyt dużo regionów po filtrze: {dbg_clean['islands']}"
    assert dbg_clean["small_islands"] == 0
    assert count_svg_subpaths(svg_clean) < 40
    assert svg_raw.startswith("<svg")


def test_n_colors_preserved():
    png = make_noisy_poster()
    for n in (2, 4, 6):
        svg, colors = main.image_to_quantized_svg(
            png, n_colors=n, keep_bg=True, filter_noise=5, detail=10
        )
        assert len(colors) == n
        assert svg.count("<g id=\"color_") <= n


def test_near_duplicate_darks_do_not_speckle():
    """Dwa prawie identyczne czernie nie mogą sypać się w dziesiątki wysp."""
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    img[:] = (200, 210, 220)
    cv2.rectangle(img, (0, 0), (320, 80), (28, 26, 24), -1)
    cv2.circle(img, (160, 140), 50, (32, 30, 28), -1)
    rng = np.random.default_rng(1)
    grain = rng.normal(0, 10, img.shape)
    img = np.clip(img.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    png = _encode_png(img)
    _, colors, dbg = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10, _debug=True
    )
    assert len(colors) == 4
    assert dbg["islands"] <= 8, f"Zbyt dużo regionów przy podobnych czerniach: {dbg['islands']}"


def test_detail_10_matches_legacy_epsilon():
    """Detail=10 musi zostać przy starym 0.0010*peri, z capem ~1.15px — nie 0.003*peri."""
    canvas = np.zeros((200, 200), np.uint8)
    cv2.circle(canvas, (100, 100), 70, 255, -1)
    cnts, _ = cv2.findContours(canvas, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    peri = float(cv2.arcLength(cnts[0], True))
    eps = main._approx_epsilon(cnts[0], 10)
    assert eps <= 0.0010 * peri + 1e-6
    assert eps <= 1.15 + 1e-6
    coarse = main._approx_epsilon(cnts[0], 1)
    assert coarse > eps


def test_organic_photo_keeps_smooth_recognisable_edges():
    """Prawdziwsze zdjęcie: mniej mikrowysp niż FN=0, ale bez długich krawędzi-drzazg."""
    png = make_organic_photo()
    svg, colors, dbg = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10, _debug=True
    )
    svg0, _, dbg0 = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=0, detail=10, _debug=True
    )
    assert len(colors) == 4
    assert dbg["small_islands"] == 0
    assert dbg["islands"] <= dbg0["islands"]
    assert dbg["islands"] <= 16
    edges = svg_edge_lengths(svg)
    assert edges, "SVG bez krawędzi"
    mean_e = float(np.mean(edges))
    p95 = float(np.percentile(edges, 95))
    assert mean_e < 2.2, f"Średnia krawędź zbyt długa (drzazgi): {mean_e:.2f}"
    assert p95 < 5.5, f"P95 krawędzi zbyt długie: {p95:.2f}"
    assert svg0.startswith("<svg")


def test_keep_bg_false_still_returns_svg():
    png = make_noisy_poster()
    svg, colors = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=False, filter_noise=5, detail=10
    )
    assert svg.startswith("<svg")
    assert len(colors) == 4


def test_vectorize_ai_endpoint():
    png = make_noisy_poster()
    client = TestClient(main.app)
    response = client.post(
        "/vectorize-ai",
        files={"file": ("poster.png", io.BytesIO(png), "image/png")},
        data={"n_colors": "4", "keep_bg": "true"},
    )
    assert response.status_code == 200, response.text[:500]
    body = response.json()
    assert "svg" in body and "detected_colors" in body
    assert body["svg"].startswith("<svg")
    assert len(body["detected_colors"]) == 4
    assert count_svg_subpaths(body["svg"]) < 40


def count_svg_vertices(svg: str) -> int:
    return len(re.findall(r"\bM\s", svg)) + len(re.findall(r"\bL\s", svg))


def make_face_with_tiny_features(width=1200, height=900, seed=4) -> bytes:
    """Duża głowa + małe oczy / błysk — detale, które 800 px + dylatacja 0.4 mm zjada."""
    rng = np.random.default_rng(seed)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (170, 200, 230)
    cv2.ellipse(img, (width // 2, int(height * 0.52)), (int(width * 0.28), int(height * 0.32)), 0, 0, 360, (30, 28, 26), -1)
    cv2.ellipse(img, (width // 2, int(height * 0.64)), (int(width * 0.12), int(height * 0.08)), 0, 0, 360, (68, 100, 150), -1)
    cv2.circle(img, (int(width * 0.42), int(height * 0.48)), 11, (14, 14, 12), -1)
    cv2.circle(img, (int(width * 0.58), int(height * 0.48)), 11, (14, 14, 12), -1)
    # Błysk oka: przy 0.2/1600 zostaje (~270 px), przy 0.4/800 + dylatacja spada pod min_area
    cv2.circle(img, (int(width * 0.435), int(height * 0.468)), 7, (245, 245, 245), -1)
    grain = rng.normal(0, 10, img.shape)
    img = np.clip(img.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    n = int(0.03 * width * height)
    ys = rng.integers(0, height, n)
    xs = rng.integers(0, width, n)
    img[ys, xs] = rng.integers(0, 256, (n, 3), dtype=np.uint8)
    return _encode_png(img)


def count_midsize_components(labels: np.ndarray, lo: int, hi: int) -> int:
    n_colors = int(labels.max()) + 1 if labels.size and labels.max() >= 0 else 0
    total = 0
    for c in range(n_colors):
        mask = (labels == c).astype(np.uint8)
        n_cc, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        for i in range(1, n_cc):
            area = int(stats[i, cv2.CC_STAT_AREA])
            if lo <= area <= hi:
                total += 1
    return total


def test_working_dim_tracks_nozzle():
    assert main._working_dim(0.4) == 800
    assert main._working_dim(0.2) == 1600
    assert main._wall_dilate_iterations(0.2, 1600) == 0
    assert main._wall_dilate_iterations(0.2, 800) == 1
    assert main._wall_dilate_iterations(0.4) == 1


def test_fine_nozzle_keeps_more_detail_than_04():
    """Dysza 0.2 mm: wyższy working_dim, więcej wierzchołków, zachowane drobne plamy."""
    png = make_face_with_tiny_features()
    svg02, _, dbg02 = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10, nozzle_mm=0.2, _debug=True
    )
    svg04, _, dbg04 = main.image_to_quantized_svg(
        png, n_colors=4, keep_bg=True, filter_noise=5, detail=10, nozzle_mm=0.4, _debug=True
    )
    assert dbg02["working_dim"] >= 1400
    assert dbg04["working_dim"] == 800
    assert dbg02["wall_dilate"] == 0
    assert dbg04["wall_dilate"] == 1
    mid02 = count_midsize_components(dbg02["remapped"], 40, 4000)
    mid04 = count_midsize_components(dbg04["remapped"], 40, 4000)
    assert mid02 > mid04, (
        f"0.2 mm powinno zachować drobne plamy (oczy/błysk): {mid02} vs {mid04}"
    )
    assert svg02.startswith("<svg")
    assert count_svg_vertices(svg02) >= 80


def test_vectorize_ai_accepts_nozzle_mm():
    png = make_noisy_poster()
    client = TestClient(main.app)
    response = client.post(
        "/vectorize-ai",
        files={"file": ("poster.png", io.BytesIO(png), "image/png")},
        data={"n_colors": "4", "keep_bg": "true", "nozzle_mm": "0.2"},
    )
    assert response.status_code == 200, response.text[:500]
    body = response.json()
    assert body["svg"].startswith("<svg")
    assert len(body["detected_colors"]) == 4


def test_vectorize_ai_accepts_makerlab_params():
    png = make_noisy_poster()
    client = TestClient(main.app)
    response = client.post(
        "/vectorize-ai",
        files={"file": ("poster.png", io.BytesIO(png), "image/png")},
        data={
            "n_colors": "4",
            "keep_bg": "true",
            "filter_noise": "5",
            "detail": "10",
        },
    )
    assert response.status_code == 200, response.text[:500]
    body = response.json()
    assert body["svg"].startswith("<svg")
    assert len(body["detected_colors"]) == 4


if __name__ == "__main__":
    test_vectorize_returns_svg_and_colors()
    test_filter_noise_removes_micro_islands()
    test_n_colors_preserved()
    test_near_duplicate_darks_do_not_speckle()
    test_detail_10_matches_legacy_epsilon()
    test_organic_photo_keeps_smooth_recognisable_edges()
    test_keep_bg_false_still_returns_svg()
    test_working_dim_tracks_nozzle()
    test_fine_nozzle_keeps_more_detail_than_04()
    test_vectorize_ai_endpoint()
    test_vectorize_ai_accepts_makerlab_params()
    test_vectorize_ai_accepts_nozzle_mm()
    print("test_vectorize_quality: OK")
