"""
Drukstacja - backend API
Obsługuje: upload pliku CAD (STL/STEP/OBJ) -> konwersja STEP -> cięcie slicerem -> zapis w R2 -> wycena druku 3D
oraz precyzyjną kwantyzację i wektoryzację obrazów (standard MakerWorld) pod wielokolorowy generator breloków FDM.
"""
import os
import re
import shutil
import tempfile
import uuid
import traceback
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import trimesh
import cv2
import numpy as np
from sklearn.cluster import KMeans

from analysis import analyze_file, UnsupportedFileType
from pricing import calculate_price, MATERIALS
from storage import upload_file_to_r2, get_file_url
from slicer import convert_step_to_stl, run_slicer
from orientation import auto_orient_mesh

# Inicjalizacja aplikacji FastAPI
app = FastAPI(title="Drukstacja API", version="0.4.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 100
ALLOWED_EXTENSIONS = {".stl", ".step", ".stp", ".obj"}


class QuoteRequest(BaseModel):
    volume_cm3: float
    bbox_mm: list[float]  # [x, y, z]
    material: str = "PLA"
    quantity: int = 1
    infill_percent: int = 20


# Bezpieczny import rembg - jeśli brakuje runtime ONNX dla Python 3.14, serwer nie padnie
try:
    from rembg import remove as rembg_remove
    REMBG_AVAILABLE = True
except Exception as _e:
    print(f"[WARN] Rembg niedostępne ({_e}), używam inteligentnego FloodFill/GrabCut")
    REMBG_AVAILABLE = False


def image_to_quantized_svg(image_bytes: bytes, n_colors: int = 4, keep_bg: bool = False):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu pliku graficznego.")

    # 1. Obsługa przezroczystości alfa
    has_alpha = False
    if len(img.shape) == 3 and img.shape[2] == 4:
        alpha_raw = img[:, :, 3] > 20
        if np.sum(alpha_raw) > 0.05 * alpha_raw.size:
            has_alpha = True
            alpha_mask = alpha_raw
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    target_dim = 420
    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 2. Usuwanie tła / wyciąganie sylwetki (Silhouette Mask)
    if has_alpha:
        fg_mask = cv2.resize(
            alpha_mask.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
        ).astype(bool)
    elif keep_bg:
        fg_mask = np.ones((new_h, new_w), dtype=bool)
    else:
        gray = cv2.cvtColor(bgr_resized, cv2.COLOR_BGR2GRAY)
        # Adaptacyjny filtr tła
        blurred = cv2.bilateralFilter(gray, 9, 75, 75)
        _, thresh = cv2.threshold(blurred, 235, 255, cv2.THRESH_BINARY_INV)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        # Znajdź największy element centralny
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(closed)
        best_label = -1
        max_area = 0
        cx, cy = new_w / 2, new_h / 2

        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            bx, by, bw, bh = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
            if bw > 0.98 * new_w and bh > 0.98 * new_h:
                continue
            dist = np.hypot(centroids[i][0] - cx, centroids[i][1] - cy)
            if area > max_area and dist < (max(new_w, new_h) * 0.45):
                max_area = area
                best_label = i

        if best_label != -1:
            fg_mask = (labels == best_label)
            # Wypełnienie dziur wewnątrz sylwetki psa (żeby baza pod spodem była pełna!)
            fg_mask = cv2.morphologyEx(fg_mask.astype(np.uint8) * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0
        else:
            fg_mask = np.ones((new_h, new_w), dtype=bool)

    # 3. Ekstrakcja czarnych linii i detali (Nos, Oczy, Obrysy fafli jak w Bambu)
    gray = cv2.cvtColor(bgr_resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)
    
    # Detekcja krawędzi i ciemnych detali
    dark_details_mask = (gray_clahe < 70) & fg_mask
    dark_details_mask = cv2.morphologyEx(dark_details_mask.astype(np.uint8) * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))) > 0

    # 4. Kwantyzacja kolorów pośrednich (Kolor sierści, cienie)
    # Wybieramy piksele obiektu, które nie są czarnymi liniami
    body_pixels_mask = fg_mask & (~dark_details_mask)
    body_pixels = bgr_resized[body_pixels_mask].reshape(-1, 3)

    if len(body_pixels) < (n_colors - 1):
        body_pixels = bgr_resized[fg_mask].reshape(-1, 3)
        body_pixels_mask = fg_mask

    # K-Means dla 3 kolorów ciała + 1 kolor dedykowany na czerń detali = 4 kolory
    n_body_colors = max(1, n_colors - 1)
    kmeans = KMeans(n_clusters=n_body_colors, random_state=42, n_init=3)
    kmeans.fit(body_pixels)

    body_centers = kmeans.cluster_centers_.astype(int)
    # Sortujemy kolory ciała od najjaśniejszego do najciemniejszego (jasny brąz -> ciemny brąz)
    brightness = [np.mean(c) for c in body_centers]
    sorted_order = np.argsort(brightness)[::-1] # Od najjaśniejszego
    body_centers = body_centers[sorted_order]

    # Składamy 4 kolory: [Najjaśniejszy, Pośredni, Ciemny, Głęboka Czerń na detale]
    hex_colors = [f"#{c[2]:02x}{c[1]:02x}{c[0]:02x}".upper() for c in body_centers]
    hex_colors.append("#1A1A1A") # Ostatni kolor: czyste detale i obrysy

    # 5. Tworzenie warstw MakerWorld (Stacking)
    # Warstwa 1: Cała sylwetka (Silhouette - brak prześwitów podłoża!)
    # Warstwa 2: Średni brąz
    # Warstwa 3: Ciemny brąz
    # Warstwa 4: Czarne detale, oczy, nos
    layer_masks = []
    
    # Warstwa 1 (Baza/Podkład): cała sylwetka
    layer_masks.append(fg_mask.astype(np.uint8) * 255)

    # Kwantyzacja ciała
    body_labels = np.full((new_h, new_w), -1, dtype=int)
    body_labels[body_pixels_mask] = kmeans.labels_

    # Mapowanie posortowanych klastrów
    for orig_idx in sorted_order[1:]:
        c_mask = (body_labels == orig_idx).astype(np.uint8) * 255
        # Delikatne poszerzenie, by zlikwidować szpary
        c_mask = cv2.dilate(c_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        layer_masks.append(c_mask)

    # Uzupełnij warstwy pośrednie jeśli zabrakło
    while len(layer_masks) < 3:
        layer_masks.append(np.zeros((new_h, new_w), dtype=np.uint8))

    # Ostatnia warstwa: Czarne obrysy, oczy, nos
    line_mask = dark_details_mask.astype(np.uint8) * 255
    line_mask = cv2.dilate(line_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
    layer_masks.append(line_mask)

    # 6. Centrowanie i wektoryzacja do SVG z zaokrąglonymi krzywymi
    y_idx, x_idx = np.where(fg_mask)
    if len(x_idx) > 0 and len(y_idx) > 0:
        min_x, max_x = np.min(x_idx), np.max(x_idx)
        min_y, max_y = np.min(y_idx), np.max(y_idx)
    else:
        min_x, max_x, min_y, max_y = 0, new_w, 0, new_h

    bbox_w = max(max_x - min_x, 1)
    bbox_h = max(max_y - min_y, 1)
    max_side = max(bbox_w, bbox_h)

    usable_box = 86.0
    scale_fit = usable_box / max_side
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    color_ids = ["color_1", "color_2", "color_3", "color_4"]
    svg_output = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']

    for l_idx in range(4):
        mask = layer_masks[l_idx]
        if not np.any(mask):
            continue

        # Wygładzenie krawędzi (Bézier-like smoothing)
        mask = cv2.GaussianBlur(mask, (3, 3), 0)
        _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)

        paths = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (12 if l_idx == 3 else 25): # Detale linii mogą być mniejsze
                continue

            perimeter = cv2.arcLength(cnt, True)
            epsilon = 0.0012 * perimeter # Bardziej gęste próbkowanie łuków
            approx = cv2.approxPolyDP(cnt, epsilon, True)

            pts = approx.reshape(-1, 2)
            if len(pts) < 3:
                continue

            def map_pt(pt):
                nx = 50.0 + (pt[0] - center_x) * scale_fit
                ny = 50.0 + (pt[1] - center_y) * scale_fit
                return nx, ny

            start_x, start_y = map_pt(pts[0])
            d = f"M {start_x:.2f} {start_y:.2f} "
            for pt in pts[1:]:
                x, y = map_pt(pt)
                d += f"L {x:.2f} {y:.2f} "
            d += "Z "
            paths.append(d)

        c_id = color_ids[l_idx]
        c_hex = hex_colors[l_idx]
        paths_str = "".join([f'<path d="{p}"/>' for p in paths])
        svg_output.append(f'<g id="{c_id}" fill="{c_hex}">{paths_str}</g>')

    svg_output.append("</svg>")
    return "".join(svg_output), hex_colors


@app.get("/")
def root():
    return {"status": "ok", "service": "drukstacja-backend"}


@app.get("/materials")
def get_materials():
    """Lista dostępnych materiałów i ich cen za kg."""
    return MATERIALS


from fastapi import Form

@app.post("/vectorize-ai")
async def vectorize_image_ai(
    file: UploadFile = File(...),
    keep_bg: str = Form("false")
):
    """Wektoryzacja konturów z obsługą AI cutout i doborem barw."""
    try:
        should_keep_bg = keep_bg.lower() in ("true", "1", "yes")
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(
            contents, n_colors=4, keep_bg=should_keep_bg
        )
        return {
            "svg": svg_result,
            "detected_colors": detected_colors
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Błąd wektoryzacji: {str(e)}")
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Przyjmuje plik CAD (STL/STEP/OBJ):
    1. Zapisuje oryginalny plik
    2. W przypadku .STEP konwertuje go na .STL
    3. Tnie model slicerem (Bambu/Prusa CLI) wyliczając realny czas i podpory
    4. Wysyła plik(i) do Cloudflare R2
    5. Zwraca dane geometrii, metadane slicera i klucze R2
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobsługiwany format pliku: {ext}. Dozwolone: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    tmp_dir = tempfile.mkdtemp()
    unique_id = uuid.uuid4().hex
    tmp_path = os.path.join(tmp_dir, f"{unique_id}{ext}")
    r2_key = f"models/{unique_id}_{file.filename}"

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"Plik za duży ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB",
            )

        # 1. Wysyłka do R2
        with open(tmp_path, "rb") as f_upload:
            upload_file_to_r2(
                file_obj=f_upload,
                object_name=r2_key,
                content_type=file.content_type or "application/octet-stream",
            )

        # 2. Konwersja STEP jeśli trzeba
        if ext in [".step", ".stp"]:
            converted_stl_path = os.path.join(tmp_dir, f"{unique_id}_converted.stl")
            convert_step_to_stl(tmp_path, converted_stl_path)
            mesh_source_path = converted_stl_path
        else:
            mesh_source_path = tmp_path

        # 3. Auto-orientacja
        raw_mesh = trimesh.load(mesh_source_path, force="mesh")
        oriented_mesh, orientation_info = auto_orient_mesh(raw_mesh)

        oriented_stl_path = os.path.join(tmp_dir, f"{unique_id}_oriented.stl")
        oriented_mesh.export(oriented_stl_path)

        # 4. Upload zorientowanego STL
        preview_stl_key = f"models/{unique_id}_oriented.stl"
        with open(oriented_stl_path, "rb") as f_stl:
            upload_file_to_r2(
                file_obj=f_stl,
                object_name=preview_stl_key,
                content_type="model/stl",
            )
        preview_stl_url = get_file_url(preview_stl_key)

        # 5. Analiza geometrii
        result = analyze_file(oriented_stl_path, ".stl")

        # 6. Slicing
        try:
            slice_data = run_slicer(oriented_stl_path, infill=20, layer_height=0.2)
            result["print_time_exact"] = slice_data["print_time"]
            result["filament_weight_g_exact"] = slice_data["filament_g"]
            result["has_supports"] = slice_data["has_supports"]
            result["support_lines"] = slice_data.get("support_lines", [])
        except Exception as slice_err:
            print(f"[WARN] Slicer error: {slice_err}")
            result["print_time_exact"] = None
            result["filament_weight_g_exact"] = None
            result["has_supports"] = False
            result["support_lines"] = []

        # 7. Zwrócenie wyniku
        result["file_key"] = r2_key
        result["preview_stl_key"] = preview_stl_key
        result["preview_stl_url"] = preview_stl_url
        result["orientation"] = orientation_info
        result["original_filename"] = file.filename

        return result

    except UnsupportedFileType as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Błąd analizy lub zapisu w R2: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/quote")
def quote(req: QuoteRequest):
    """Liczy cenę na podstawie geometrii zwróconej przez /analyze."""
    if req.material not in MATERIALS:
        raise HTTPException(status_code=400, detail=f"Nieznany materiał: {req.material}")

    result = calculate_price(
        volume_cm3=req.volume_cm3,
        bbox_mm=req.bbox_mm,
        material=req.material,
        quantity=req.quantity,
        infill_percent=req.infill_percent,
    )
    return result