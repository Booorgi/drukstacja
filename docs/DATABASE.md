# Railway Postgres + Supabase Auth

Railway Postgres jest jedynym źródłem prawdy dla danych biznesowych (`orders`, `checkouts`, `filaments`, `products`).
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
| `STRIPE_SECRET_KEY` | tak (kasa) | Secret key Stripe — tworzenie Checkout Session (PLN). |
| `STRIPE_WEBHOOK_SECRET` | tak (kasa) | Signing secret endpointu `POST /api/webhooks/stripe`. |
| `STRIPE_PUBLISHABLE_KEY` | nie | MVP nie używa Elements; opcjonalnie pod przyszły client. |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | tak (kasa) | Publiczny URL frontendu — `success_url` / `cancel_url` Stripe. |
| `ADMIN_EMAILS` | tak (admin) | E-maile staff po przecinku; muszą zgadzać się z `email` w JWT Supabase. |
| `MIN_ORDER_PLN` | nie | Domyślnie `30`. |
| `SHIPPING_AMOUNT_PLN` | nie | Placeholder wysyłki, domyślnie `0`. |
| `R2_*` | jak dotychczas | Cloudflare R2 dla plików produkcyjnych. |
| `PORT` | Railway | Port uvicorn (Dockerfile). |

### Frontend (Vercel / Next.js)

| Zmienna | Wymagane | Opis |
|---------|----------|------|
| `NEXT_PUBLIC_API_URL` | tak | Publiczny URL backendu FastAPI (np. `https://drukstacja-api.up.railway.app`). Lokalnie: `http://localhost:8000` (default w `next.config.js`). |
| `NEXT_PUBLIC_SUPABASE_URL` | tak | Tylko Auth (login / signup / sesja). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tak | Tylko Auth. Anon key **nie** jest używany do CRUD zleceń. |
| `NEXT_PUBLIC_SITE_URL` | tak (kasa) | Ten sam origin co success/cancel Stripe (`/kasa/sukces`, `/kasa/anulowano`). |

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
| `POST` | `/api/checkout` | JWT | Zamraża `in_cart` (print + `shop_sku`) w `checkouts`, status `pending_payment`, zwraca URL Stripe Checkout. |
| `POST` | `/api/checkout/cancel` | JWT | Przywraca nieopłacone linie do koszyka. |
| `GET` | `/api/checkout/{id}` | JWT | Własny nagłówek + linie. |
| `POST` | `/api/webhooks/stripe` | podpis Stripe | `checkout.session.completed` / `payment_intent.succeeded` → `paid` + `in_queue` (idempotentnie). |
| `GET` | `/api/admin/checkouts` | JWT + `ADMIN_EMAILS` | Lista opłaconych / w pipeline. `?status=`, `?payment=paid\|pending\|all`, `?q=` (ID, e-mail, plik). Zwraca też `counts`. |
| `PATCH` | `/api/admin/checkouts/{id}` | JWT + `ADMIN_EMAILS` | `in_queue` → `in_production` → `post_processing` → `shipped`. |

Istniejące endpointy silnika druku bez zmian kontraktu:

- `POST /api/analyze-model`, `POST /api/reslice-model`
- `POST /api/generate-3mf` — po `order_id` zapisuje `production_file_url` **w Railway**
- `POST /api/orders/upload-geometry`, `GET /api/orders/{id}/download-3mf`
- `GET /api/filaments` — ten sam `DATABASE_URL`

## API sklepu

Cena i stan zawsze z tabeli `products`. Klient nie ustawia `total_price`.

| Metoda | Ścieżka | Auth | Działanie |
|--------|---------|------|-----------|
| `GET` | `/api/products` | publiczne | Aktywne SKU (`source`: `database` albo `fallback`). `?category=hardware` filtruje po slugu. Odpowiedź zawiera `categories` (slug, label, hint, count). |
| `GET` | `/api/products/{id}` | publiczne | Detal po `id` albo `sku`. |
| `POST` | `/api/products/{id}/cart` | JWT | Linia `orders` `in_cart` typu `shop_sku`. Ponowne dodanie zwiększa ilość. |

Linia sklepowa używa istniejących kolumn `orders` (bez nowej tabeli koszyka):

- `technology` = `shop_sku` (odróżnia od wydruku / breloka)
- `file_name` = nazwa produktu
- `material` = slug kategorii (`hardware`, `materialy`, …)
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
Statusy produkcyjne po wpłacie ustawia webhook (`in_queue`) oraz panel `/admin`.
Kolumna `checkout_id` spina linię z nagłówkiem `checkouts`.

## Schemat `checkouts`

Ta sama komenda `python db_setup.py` (oraz `ensure_oms_schema()` w FastAPI `lifespan`) tworzy tabelę nagłówka zamówienia.

| Kolumna | Typ | Uwagi |
|---------|-----|--------|
| `id` | `UUID` PK | Nagłówek OMS. |
| `user_id` | `UUID` | Z JWT `sub`. |
| `shipping_*` | tekst | `name`, `phone`, `street`, `city`, `postal_code`, `country` (domyślnie `PL`). |
| `company`, `nip` | opcjonalne | Dane firmowe / NIP. |
| `subtotal`, `shipping`, `total` | `NUMERIC(10,2)` | Wysyłka placeholder (`SHIPPING_AMOUNT_PLN`, domyślnie 0). |
| `payment_status` | `VARCHAR` | `pending` / `paid` / `cancelled` / `failed`. |
| `production_status` | `VARCHAR` | `pending_payment` → `in_queue` → `in_production` → `post_processing` → `shipped`. |
| `stripe_session_id`, `stripe_payment_intent_id` | tekst | Idempotencja webhooka. |
| `customer_email` | tekst | E-mail z JWT w chwili checkoutu — szukanie w `/admin`. |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | |

Stripe Dashboard → Webhooks → endpoint:

`https://<RAILWAY_API_HOST>/api/webhooks/stripe`

Zdarzenia: `checkout.session.completed`, `payment_intent.succeeded`.
Szczegóły env: [CHECKOUT.md](CHECKOUT.md).

## Schemat `products`

Ta sama komenda `python db_setup.py` tworzy tabelę i seeduje 4 SKU z poprzedniego mocka `/sklep` (`ON CONFLICT DO NOTHING`), a potem **normalizuje** `category` do slugów. Gotowe printy (`gotowe-printy`) zostają puste — tylko zabawki użytkowe, bez litofanów i ozdób.

Backend nie wymaga ręcznego odpalenia skryptu po deployu: FastAPI `lifespan` woła `ensure_products_on_startup()` oraz `ensure_oms_schema()` (idempotentne CREATE / seed / remap). Chwilowy brak Postgresa jest logowany i API startuje z fallbackiem in-code.

Dockerfile / `start.sh` dodatkowo odpalają `db_setup.py`, a potem `exec uvicorn` na `${PORT:-8080}`. Na Railway `startCommand` **nie jest shellem**: `python db_setup.py && uvicorn` kończy proces po seedzie, a `--port ${PORT:-8080}` dochodzi do uvicorn jako literał. Użyj `sh start.sh` albo `uvicorn main:app --host 0.0.0.0 --port 8080`.

| Kolumna | Typ | Uwagi |
|---------|-----|--------|
| `id` | `VARCHAR(50)` PK | To samo co sku w seedzie. |
| `sku` | `VARCHAR(50)` UNIQUE | Identyfikator magazynowy. |
| `name`, `description` | tekst | Karta sklepu. |
| `category` | `VARCHAR(100)` | Stabilny slug: `materialy`, `hardware`, `narzedzia`, `gotowe-printy`, `akcesoria`. `db_setup.py` remapuje stare etykiety (Filamenty, Akcesoria DFM, …). |
| `badge`, `icon` | opcjonalne | Odznaka (BESTSELLER / NOWY / PROMO albo seed) jest osobna od kategorii. Ikona gdy brak `image_url`. |
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
