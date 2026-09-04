"""
Drukstacja - backend API
Obsluguje: upload pliku CAD -> analiza geometrii -> wycena druku 3D
"""
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analysis import analyze_file, UnsupportedFileType
from pricing import calculate_price, MATERIALS

app = FastAPI(title="Drukstacja API", version="0.1.0")

# W produkcji zmien "*" na adres swojej domeny frontendu, np. https://drukstacja.pl
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


@app.get("/")
def root():
    return {"status": "ok", "service": "drukstacja-backend"}


@app.get("/materials")
def get_materials():
    """Lista dostepnych materialow i ich cen za kg."""
    return MATERIALS


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Przyjmuje plik CAD (STL/STEP/OBJ), zwraca podstawowe dane geometrii:
    objetosc, bounding box, powierzchnie.
    Nie liczy jeszcze ceny - to osobny krok (/quote), zeby frontend mogl
    pozwolic userowi zmienic material/ilosc bez ponownego wgrywania pliku.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobslugiwany format pliku: {ext}. Dozwolone: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Zapisz tymczasowo na dysku, zeby biblioteki CAD mogly go wczytac
    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, f"{uuid.uuid4().hex}{ext}")

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(status_code=400, detail=f"Plik za duzy ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB")

        result = analyze_file(tmp_path, ext)
        return result

    except UnsupportedFileType as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # W produkcji: loguj pelny traceback do systemu logow (np. Railway logs)
        raise HTTPException(status_code=500, detail=f"Blad analizy pliku: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/quote")
def quote(req: QuoteRequest):
    """Liczy cene na podstawie danych geometrii zwroconych przez /analyze."""
    if req.material not in MATERIALS:
        raise HTTPException(status_code=400, detail=f"Nieznany material: {req.material}")

    result = calculate_price(
        volume_cm3=req.volume_cm3,
        bbox_mm=req.bbox_mm,
        material=req.material,
        quantity=req.quantity,
        infill_percent=req.infill_percent,
    )
    return result
