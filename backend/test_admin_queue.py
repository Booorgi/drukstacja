"""Filtry i szukanie panelu /admin — bez bazy."""
from admin_api import (
    checkout_matches_query,
    count_admin_checkouts,
    filter_admin_checkouts,
)


def _row(**overrides):
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "customer_email": "jan@example.com",
        "shipping_name": "Jan Kowalski",
        "shipping_phone": "500600700",
        "company": "Booorgi",
        "nip": "5252345678",
        "payment_status": "paid",
        "production_status": "in_queue",
        "created_at": "2026-09-13T20:00:00+00:00",
        "lines": [
            {
                "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "file_name": "cube.stl",
                "material": "PLA (Czysta Biel)",
                "layer_height": "0.20 mm",
            }
        ],
    }
    row.update(overrides)
    return row


def test_search_matches_id_email_file_and_product():
    queue = _row()
    shop = _row(
        id="22222222-2222-2222-2222-222222222222",
        customer_email="anna@drukstacja.pl",
        production_status="in_production",
        lines=[
            {
                "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "file_name": "Zestaw Wkładek Gwintowanych",
                "material": "hardware",
                "layer_height": "sku_brass_inserts",
            }
        ],
    )
    assert checkout_matches_query(queue, "11111111")
    assert checkout_matches_query(queue, "jan@example")
    assert checkout_matches_query(queue, "CUBE")
    assert checkout_matches_query(shop, "wkładek")
    assert checkout_matches_query(shop, "sku_brass")
    assert not checkout_matches_query(queue, "nieistnieje")


def test_filters_keep_pipeline_default_and_expose_pending():
    queue = _row()
    print_job = _row(
        id="33333333-3333-3333-3333-333333333333",
        production_status="in_production",
        created_at="2026-09-13T19:00:00+00:00",
    )
    pending = _row(
        id="44444444-4444-4444-4444-444444444444",
        payment_status="pending",
        production_status="pending_payment",
        customer_email="nowy@example.com",
    )
    catalog = [print_job, pending, queue]

    default = filter_admin_checkouts(catalog)
    assert [row["id"] for row in default] == [queue["id"], print_job["id"]]

    waiting = filter_admin_checkouts(catalog, status="pending_payment")
    assert [row["id"] for row in waiting] == [pending["id"]]

    printing = filter_admin_checkouts(catalog, status="in_production")
    assert [row["id"] for row in printing] == [print_job["id"]]

    paid = filter_admin_checkouts(catalog, payment="paid")
    assert pending["id"] not in [row["id"] for row in paid]

    found = filter_admin_checkouts(catalog, query="nowy@")
    assert found == []
    found_pending = filter_admin_checkouts(
        catalog, status="pending_payment", query="nowy@"
    )
    assert [row["id"] for row in found_pending] == [pending["id"]]


def test_counts_split_queue_and_payment():
    catalog = [
        _row(),
        _row(id="p1", production_status="in_production"),
        _row(
            id="pay",
            payment_status="pending",
            production_status="pending_payment",
        ),
        _row(id="ship", production_status="shipped"),
    ]
    counts = count_admin_checkouts(catalog)
    assert counts["all"] == 3
    assert counts["in_queue"] == 1
    assert counts["in_production"] == 1
    assert counts["shipped"] == 1
    assert counts["pending_payment"] == 1
    assert counts["paid"] == 3
    assert counts["pending"] == 1
