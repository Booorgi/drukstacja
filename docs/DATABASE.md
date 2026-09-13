# Railway Postgres + Supabase Auth

Railway Postgres jest jedynym źródłem prawdy dla danych biznesowych (`orders`, `filaments`, `products`).
Supabase zostaje wyłącznie do Auth (email / hasło) po stronie frontendu.

## Zmienne środowiskowe

### Backend (Railway)

| Zmienna | Wymagane | Opis |
|---------|----------|------|
| `DATABASE_URL` | tak | Connection string Railway Postgres (`postgres://` jest automatycznie zamieniane na `postgresql://`). |
| `SUPABASE_JWT_SECRET` | tak (albo JWKS) | JWT Secret z Settings → API w projekcie Supabase. Backend weryfikuje nim `Authorization: Bearer <access_token>`. |
| `SUPABASE_URL` | opcjonalnie | URL projektu (`https://xxxx.supabase.co`). Używany do JWKS, gdy brak secretu albo token jest ES256/RS256. |
| `SUPABASE_JWKS_URL` | opcjonalnie | Nadpisanie JWKS, domyślnie `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. |
| `SUPABASE_JWT_AUDIENCE` | nie | Domyślnie `authenticated`. |
| `ALLOWED_ORIGINS` | nie | CORS, lista po przecinku. Domyślnie `*`. |
| `R2_*` | jak dotychczas | Cloudflare R2 dla plików produkcyjnych. |
| `PORT` | Railway | Port uvicorn (Dockerfile). |

### Frontend (Vercel / Next.js)

| Zmienna | Wymagane | Opis |
|---------|----------|------|
| `NEXT_PUBLIC_API_URL` | tak | Publiczny URL backendu FastAPI (np. `https://drukstacja-api.up.railway.app`). Lokalnie: `http://localhost:8000` (default w `next.config.js`). |
| `NEXT_PUBLIC_SUPABASE_URL` | tak | Tylko Auth (login / signup / sesja). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tak | Tylko Auth. Anon key **nie** jest używany do CRUD zleceń. |

Frontend **nie** pisze już do tabeli Supabase `orders`. Klient Supabase (`frontend/lib/supabaseClient.js`) zostaje wyłącznie pod `supabase.auth`.

### Migracja (jednorazowo, lokalnie)

| Zmienna | Opis |
|---------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz service_role do odczytu starych wierszy `orders` (nie wdrażać na frontend). |
| `DATABASE_URL` | Docelowa baza Railway. |

## API zleceń (JWT z sesji Supabase)

`user_id` zawsze pochodzi z claimu `sub`. Pole `user_id` z body jest ignorowane.

| Metoda | Ścieżka | Auth | Działanie |
|--------|---------|------|-----------|
| `GET` | `/api/orders` | JWT | Lista zleceń użytkownika. `?status=in_cart` = koszyk. |
| `POST` | `/api/orders` | JWT | Nowa linia (domyślnie `in_cart`). |
| `POST` | `/api/orders/rfq` | JWT opcjonalny | RFQ (`rfq_pending`). Bez tokenu `user_id` jest NULL. |
| `GET` | `/api/orders/{id}` | JWT | Jedno zlecenie (tylko właściciel). |
| `PATCH` | `/api/orders/{id}` | JWT | Aktualizacja pól technicznych / `production_file_url` / status `cancelled`. |
| `DELETE` | `/api/orders/{id}` | JWT | Soft-cancel (`status=cancelled`). |
| `POST` | `/api/orders/clear-cart` | JWT | Anuluje wszystkie `in_cart` użytkownika. |

Istniejące endpointy silnika druku bez zmian kontraktu:

- `POST /api/analyze-model`, `POST /api/reslice-model`
- `POST /api/generate-3mf` — po `order_id` zapisuje `production_file_url` **w Railway**
- `POST /api/orders/upload-geometry`, `GET /api/orders/{id}/download-3mf`
- `GET /api/filaments` — ten sam `DATABASE_URL`

## API sklepu

Cena i stan zawsze z tabeli `products`. Klient nie ustawia `total_price`.

| Metoda | Ścieżka | Auth | Działanie |
|--------|---------|------|-----------|
| `GET` | `/api/products` | publiczne | Aktywne SKU (`source`: `database` albo `fallback` z seedu). |
| `GET` | `/api/products/{id}` | publiczne | Detal po `id` albo `sku`. |
| `POST` | `/api/products/{id}/cart` | JWT | Linia `orders` `in_cart` typu `shop_sku`. Ponowne dodanie zwiększa ilość. |

Linia sklepowa używa istniejących kolumn `orders` (bez nowej tabeli koszyka):

- `technology` = `shop_sku` (odróżnia od wydruku / breloka)
- `file_name` = nazwa produktu
- `material` = kategoria
- `layer_height` = sku
- `total_price` = `price * quantity` z magazynu

## Schemat `orders`

Uruchom na Railway (albo lokalnie) po deployu:

```bash
cd backend
python db_setup.py
```

Nowe / uzupełnione kolumny względem starego `CREATE`:

- `nozzle_size` — UI `/orders` i fallback 3MF
- `updated_at`
- `production_file_url`, `file_name`, `technology` jako `TEXT`
- `dimensions_mm` jako `DOUBLE PRECISION[]`
- indeks `(user_id, status)`

Statusy: `in_cart`, `pending_payment`, `in_queue`, `in_production`, `post_processing`, `shipped`, `rfq_pending`, `cancelled`.

Klient może tworzyć tylko `in_cart` / `rfq_pending` i ustawiać status na `cancelled`.
Kolejne statusy produkcyjne zostają na później (poza zakresem tej zmiany).

## Schemat `products`

Ta sama komenda `python db_setup.py` tworzy tabelę i seeduje 4 SKU z poprzedniego mocka `/sklep` (`ON CONFLICT DO NOTHING`).

| Kolumna | Typ | Uwagi |
|---------|-----|--------|
| `id` | `VARCHAR(50)` PK | To samo co sku w seedzie. |
| `sku` | `VARCHAR(50)` UNIQUE | Identyfikator magazynowy. |
| `name`, `description` | tekst | Karta sklepu. |
| `category`, `badge`, `icon` | opcjonalne | UI `/sklep` (ikona gdy brak `image_url`). |
| `price` | `NUMERIC(10,2)` | Cena jednostkowa. |
| `currency` | `VARCHAR(8)` | Domyślnie `PLN`. |
| `image_url` | `TEXT` | Opcjonalne zdjęcie. |
| `stock` | `INT` | Stan; `0` albo `in_stock=false` blokuje Dodaj. |
| `in_stock`, `active` | `BOOLEAN` | Katalog pokazuje tylko `active`. |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | |

## Migracja starych wierszy z Supabase

1. Uruchom `python db_setup.py` na Railway, żeby tabela `orders` miała pełny schemat.
2. Skopiuj wiersze **jednorazowo**:

```bash
# wariant A — bezpośrednio z Supabase REST
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export DATABASE_URL=postgresql://...
python backend/migrate_supabase_orders.py

# wariant B — eksport JSON z Table Editor
python backend/migrate_supabase_orders.py --from-json orders.json --dry-run
python backend/migrate_supabase_orders.py --from-json orders.json
```

`id` i `user_id` są zachowywane (`ON CONFLICT (id) DO NOTHING`), więc sesja Supabase nadal mapuje zlecenia użytkownika.

3. Po weryfikacji koszyka i `/orders` można wyłączyć RLS / tabelę `orders` w Supabase (Auth zostaje).

## Lokalny rozwój

```bash
# backend
cd backend
python db_setup.py
export DATABASE_URL=postgresql://...
export SUPABASE_JWT_SECRET=...
uvicorn main:app --reload --port 8000

# frontend
cd frontend
# .env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm run dev
```
