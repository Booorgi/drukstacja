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
    test_keep_bg_false_still_returns_svg()
    test_vectorize_ai_endpoint()
    test_vectorize_ai_accepts_makerlab_params()
    print("test_vectorize_quality: OK")
