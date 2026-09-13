# Stripe Checkout + OMS (MVP)

Ścieżka: koszyk → adres → Stripe Checkout Session (PLN) → webhook `paid` / `in_queue` → `/admin`.

Poza zakresem: InPost/DPD, faktury, e-maile Resend (placeholdery w UI).

## Railway — zmienne backendu

Ustaw na serwisie FastAPI (nie commituj sekretów):

| Zmienna | Wymagane | Opis |
|---------|----------|------|
| `STRIPE_SECRET_KEY` | tak | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | tak | `whsec_…` z endpointu poniżej |
| `STRIPE_PUBLISHABLE_KEY` | nie | MVP przekierowuje na `session.url` (bez Elements) |
| `NEXT_PUBLIC_SITE_URL` albo `SITE_URL` | tak | Origin frontendu, np. `https://drukstacja.pl` |
| `ADMIN_EMAILS` | tak (panel) | E-maile staff po przecinku, np. `ops@booorgi.pl` |
| `MIN_ORDER_PLN` | nie | Domyślnie `30` |
| `SHIPPING_AMOUNT_PLN` | nie | Domyślnie `0` |

Frontend (Vercel): `NEXT_PUBLIC_SITE_URL` = ten sam origin co success/cancel.

## Stripe Dashboard

1. Developers → Webhooks → Add endpoint.
2. URL:

```
https://<RAILWAY_PUBLIC_API_HOST>/api/webhooks/stripe
```

3. Zdarzenia: `checkout.session.completed`, `payment_intent.succeeded`.
4. Skopiuj Signing secret → `STRIPE_WEBHOOK_SECRET`.
5. Lokalnie: `stripe listen --forward-to localhost:8000/api/webhooks/stripe`.

Success / cancel (ustawiane przez API):

- `{SITE}/kasa/sukces?session_id={CHECKOUT_SESSION_ID}`
- `{SITE}/kasa/anulowano?checkout_id=<uuid>`

## Migracja

```bash
cd backend
python db_setup.py
```

Przy starcie API `ensure_oms_schema()` dopina tabelę `checkouts` i `orders.checkout_id` (idempotentnie).

## Panel

`/admin` — tylko gdy e-mail z JWT ∈ `ADMIN_EMAILS`.
Status: `in_queue` → `in_production` → `post_processing` → `shipped`. Link 3MF gdy `production_file_url` jest na linii.
Filtry (`status`, `payment`) i `q` (ID / e-mail / plik) na `GET /api/admin/checkouts`. Kolejka podświetla nowe `in_queue` i odświeża się co 20 s.
