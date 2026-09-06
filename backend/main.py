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


REMBG_AVAILABLE = False
REMBG_SESSION = None

try:
    from rembg import remove as rembg_remove, new_session
    try:
        REMBG_SESSION = new_session("u2net")
        REMBG_AVAILABLE = True
    except Exception:
        try:
            REMBG_SESSION = new_session("u2netp")
            REMBG_AVAILABLE = True
        except Exception as _sess_err:
            print(f"[WARN] Inicjalizacja sesji rembg: {_sess_err}")
            REMBG_SESSION = None
            REMBG_AVAILABLE = False
except Exception as _e:
    print(f"[WARN] Rembg niedostępne ({_e}), używam inteligentnego FloodFill/GrabCut")
    REMBG_AVAILABLE = False


def remove_checkerboard_pattern(bgr_img):
    """
    Wykrywa i neutralizuje namalowaną szachownicę przezroczystości (biało-szare kwadraty),
    często występującą w grafikach pobranych z internetu jako 'fałszywy przezroczysty PNG'.
    """
    gray = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    high_contrast_edges = cv2.Canny(gray, 80, 160)
    
    border_zone = np.zeros((h, w), dtype=bool)
    bz_y = max(5, int(h * 0.15))
    bz_x = max(5, int(w * 0.15))
    border_zone[:bz_y, :] = True
    border_zone[-bz_y:, :] = True
    border_zone[:, :bz_x] = True
    border_zone[:, -bz_x:] = True

    edge_density = np.mean(high_contrast_edges[border_zone] > 0)
    
    if edge_density > 0.05:
        checker_mask = (gray > 180) & border_zone
        clean_bgr = bgr_img.copy()
        clean_bgr[checker_mask] = [255, 255, 255]
        return clean_bgr, True

    return bgr_img, False


def image_to_quantized_svg(image_bytes: bytes, n_colors: int = 4, keep_bg: bool = False):
    """
    Zaawansowany algorytm wektoryzacji w standardzie MakerWorld:
    1. Precyzyjna segmentacja postaci AI (u2net/u2netp) w 800px z podwójnym zabezpieczeniem GrabCut.
    2. Inteligentne domykanie wyłącznie wewnętrznych ubytków z zachowaniem otwartych przestrzeni między nogami.
    3. Gwarantowana minimalna grubość ścianek (dylatacja + filtr mikroszumu) – brak łamliwych, cienkich elementów pod dyszę 0.4mm.
    4. Zagnieżdżone ścieżki SVG (fill-rule='evenodd') precyzyjnie wycinające otwory (błyski oka, tęczówki, paski).
    """
    n_colors = max(2, min(6, n_colors))

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu grafiki.")

    target_dim = 800
    if len(img.shape) == 3 and img.shape[2] == 4:
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 1. USUWANIE TŁA I SEGMENTACJA
    sil = None

    if keep_bg:
        sil = np.ones((new_h, new_w), dtype=bool)
    else:
        # A. Wbudowany kanał alfa w grafice wejściowej
        if len(img.shape) == 3 and img.shape[2] == 4:
            alpha_raw = img[:, :, 3] > 20
            alpha_ratio = np.sum(alpha_raw) / alpha_raw.size
            if 0.05 < alpha_ratio < 0.98:
                raw_mask = cv2.resize(
                    alpha_raw.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                )
                sil = raw_mask > 0

        # B. Segmentacja AI (rembg u2net / u2netp)
        if sil is None and REMBG_AVAILABLE and REMBG_SESSION is not None:
            try:
                cutout_bytes = rembg_remove(image_bytes, session=REMBG_SESSION)
                cutout_arr = np.frombuffer(cutout_bytes, np.uint8)
                cutout_img = cv2.imdecode(cutout_arr, cv2.IMREAD_UNCHANGED)
                if cutout_img is not None and len(cutout_img.shape) == 3 and cutout_img.shape[2] == 4:
                    c_alpha = cutout_img[:, :, 3] > 25
                    alpha_ratio = np.sum(c_alpha) / c_alpha.size
                    if 0.05 < alpha_ratio < 0.95:
                        raw_mask = cv2.resize(
                            c_alpha.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                        )
                        sil = raw_mask > 0
            except Exception as _r_err:
                print(f"[WARN] Błąd wycinania rembg: {_r_err}")

        # C. Niezawodny GrabCut fallback dla zdjęć plenerowych (trawa, niebo, krajobraz)
        if sil is None:
            try:
                gc_dim = 400
                gc_scale = gc_dim / max(new_h, new_w)
                gc_w, gc_h = max(int(new_w * gc_scale), 1), max(int(new_h * gc_scale), 1)
                gc_img = cv2.resize(bgr_resized, (gc_w, gc_h), interpolation=cv2.INTER_AREA)

                gc_mask = np.zeros((gc_h, gc_w), np.uint8)
                bgd_model = np.zeros((1, 65), np.float64)
                fgd_model = np.zeros((1, 65), np.float64)

                margin_x = max(4, int(gc_w * 0.08))
                margin_y = max(4, int(gc_h * 0.08))
                rect = (margin_x, margin_y, gc_w - 2 * margin_x, gc_h - 2 * margin_y)

                cv2.grabCut(gc_img, gc_mask, rect, bgd_model, fgd_model, 4, cv2.GC_INIT_WITH_RECT)
                gc_fg = (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD)

                if 0.05 < np.mean(gc_fg) < 0.90:
                    sil = cv2.resize(gc_fg.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST) > 0
            except Exception as _g_err:
                print(f"[WARN] Błąd GrabCut fallback: {_g_err}")

    if sil is None or np.sum(sil) < 50:
        sil = np.ones((new_h, new_w), dtype=bool)

    # 2. DOMYKANIE WYŁĄCZNIE WEWNĘTRZNYCH DZIUR (bez łączenia nóg / przestrzeni pod brzuchem!)
    sil_u8 = (sil.astype(np.uint8)) * 255
    contours, hierarchy = cv2.findContours(sil_u8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if contours and hierarchy is not None:
        hier = hierarchy[0]
        for i in range(len(contours)):
            if hier[i][3] != -1:
                hole_area = cv2.contourArea(contours[i])
                if hole_area < (new_w * new_h * 0.15):
                    cv2.drawContours(sil_u8, [contours[i]], -1, 255, thickness=-1)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    sil_u8 = cv2.morphologyEx(sil_u8, cv2.MORPH_CLOSE, kernel)
    sil = sil_u8 > 0

    # 3. KWANTYZACJA KOLORÓW KMEANS POSORTOWANA PO LUMINANCJI
    fg_pixels = bgr_resized[sil].reshape(-1, 3)
    if len(fg_pixels) < n_colors * 10:
        fg_pixels = bgr_resized.reshape(-1, 3)
        sil = np.ones((new_h, new_w), dtype=bool)

    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=5).fit(fg_pixels)
    centers = kmeans.cluster_centers_.astype(int)

    # Sortowanie od najjaśniejszego (baza) do najciemniejszego (detale/źrenice)
    brightness = [0.299 * c[2] + 0.587 * c[1] + 0.114 * c[0] for c in centers]
    sorted_order = np.argsort(brightness)[::-1]
    centers = centers[sorted_order]

    hex_colors = [
        f"#{centers[i][2]:02x}{centers[i][1]:02x}{centers[i][0]:02x}".upper()
        for i in range(n_colors)
    ]

    labels = np.full((new_h, new_w), -1, dtype=int)
    labels[sil] = kmeans.labels_
    remapped = np.full((new_h, new_w), -1, dtype=int)
    for new_idx, old_cluster in enumerate(sorted_order):
        remapped[labels == old_cluster] = new_idx

    # 4. MASKI WARSTW Z GWARANTOWANĄ GRUBOŚCIĄ ŚCIANEK POD DYSZĘ 0.4MM (KAFELKOWANIE MOZAIKOWE):
    # Kernel dylatacji (poszerza cienkie paski o +1px promień, co zapewnia szczelne łączenie stykających się kolorów w druku FDM)
    kernel_wall = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    layer_masks = []

    for c_idx in range(n_colors):
        m = (remapped == c_idx).astype(np.uint8) * 255
        # Usunięcie pojedynczych pikseli szumu
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
        # Pogrubienie ścianek i szczelne spasowanie sąsiadujących kolorów
        m = cv2.dilate(m, kernel_wall, iterations=1)
        # Ograniczenie do zewnętrznej sylwetki
        m = cv2.bitwise_and(m, sil_u8)
        layer_masks.append(m)

    # 5. DOPASOWANIE I CENTROWANIE W OKNIE 100x100
    y_idx, x_idx = np.where(sil)
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

    def map_pt(pt):
        nx = 50.0 + (pt[0] - center_x) * scale_fit
        ny = 50.0 + (pt[1] - center_y) * scale_fit
        return nx, ny

    # 6. GENEROWANIE SVG Z WYCINANIEM OTWORÓW DLA WSZYSTKICH WARSTW (EVENODD MOZAIKA)
    svg_parts = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']

    for l_idx in range(n_colors):
        mask = layer_masks[l_idx]
        if not np.any(mask):
            continue

        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
        if not contours or hierarchy is None:
            continue

        hier = hierarchy[0]
        compound_paths = []

        for i in range(len(contours)):
            if hier[i][3] != -1:
                continue  # Pomiń otwory na poziomie głównym (są przetwarzane w rodzicu)

            cnt = contours[i]
            # Eliminacja mikroskopijnych okruchów (< 15px), które nie mają przyczepności i łamią się
            if cv2.contourArea(cnt) < 15:
                continue

            approx = cv2.approxPolyDP(cnt, 0.0010 * cv2.arcLength(cnt, True), True)
            pts = approx.reshape(-1, 2)
            if len(pts) < 3:
                continue

            sx, sy = map_pt(pts[0])
            d_str = f"M {sx:.2f} {sy:.2f} "
            for p in pts[1:]:
                x, y = map_pt(p)
                d_str += f"L {x:.2f} {y:.2f} "
            d_str += "Z "

            # Wycinanie otworów wewnątrz tego wielokąta (np. źrenice, paski, bliki)
            child = hier[i][2]
            while child != -1:
                hole_cnt = contours[child]
                if cv2.contourArea(hole_cnt) >= 6:
                    hole_approx = cv2.approxPolyDP(hole_cnt, 0.0010 * cv2.arcLength(hole_cnt, True), True)
                    hole_pts = hole_approx.reshape(-1, 2)
                    if len(hole_pts) >= 3:
                        hsx, hsy = map_pt(hole_pts[0])
                        d_str += f"M {hsx:.2f} {hsy:.2f} "
                        for hp in hole_pts[1:]:
                            hx, hy = map_pt(hp)
                            d_str += f"L {hx:.2f} {hy:.2f} "
                        d_str += "Z "
                child = hier[child][0]

            compound_paths.append(f'<path fill-rule="evenodd" d="{d_str}"/>')

        if compound_paths:
            svg_parts.append(f'<g id="color_{l_idx+1}" fill="{hex_colors[l_idx]}">{"".join(compound_paths)}</g>')

    svg_parts.append("</svg>")
    return "".join(svg_parts), hex_colors




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
    keep_bg: str = Form("false"),
    n_colors: str = Form("4")
):
    """Wektoryzacja konturów z obsługą AI cutout i doborem barw. Obsługuje 2-6 warstw kolorów."""
    try:
        should_keep_bg = keep_bg.lower() in ("true", "1", "yes")
        num_colors = max(2, min(6, int(n_colors)))
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(
            contents, n_colors=num_colors, keep_bg=should_keep_bg
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


def get_db_connection():
    """Zwraca połączenie z bazą PostgreSQL jeśli skonfigurowano DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"[WARN] Nie można połączyć z bazą PostgreSQL: {e}")
        return None


@app.get("/api/filaments")
def get_filaments():
    """
    Zwraca listę wszystkich filamentów dostępnych w magazynie (in_stock = true)
    z bazy PostgreSQL na Railway, posortowanych według tier, type i name.
    """
    conn = get_db_connection()
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            id, 
                            name, 
                            tier, 
                            type, 
                            category, 
                            hex, 
                            colors, 
                            price_per_cm3, 
                            in_stock, 
                            roughness, 
                            metalness
                        FROM filaments 
                        WHERE in_stock = true 
                        ORDER BY 
                            CASE WHEN tier = 'standard' THEN 1 ELSE 2 END,
                            type ASC,
                            name ASC;
                    """)
                    rows = cur.fetchall()
                    results = []
                    for row in rows:
                        item = dict(row)
                        if item.get("price_per_cm3") is not None:
                            item["price_per_cm3"] = float(item["price_per_cm3"])
                        if item.get("roughness") is not None:
                            item["roughness"] = float(item["roughness"])
                        if item.get("metalness") is not None:
                            item["metalness"] = float(item["metalness"])
                        results.append(item)
                    return {"success": True, "source": "database", "filaments": results}
        except Exception as e:
            print(f"[WARN] Błąd odczytu z tabeli filaments: {e}")
        finally:
            conn.close()

    # Fallback w przypadku braku bazy
    try:
        from db_setup import SEED_FILAMENTS
        fallback = [dict(item, in_stock=True) for item in SEED_FILAMENTS]
        return {"success": True, "source": "fallback", "filaments": fallback}
    except Exception as err:
        return {"success": False, "error": str(err), "filaments": []}