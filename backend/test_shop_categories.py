from shop_categories import (
    build_category_counts,
    category_label,
    normalize_category_slug,
    parse_category_filter,
)


def test_seed_skus_map_to_stable_slugs():
    assert normalize_category_slug("Akcesoria DFM", sku="sku_brass_inserts") == "hardware"
    assert normalize_category_slug("Filamenty", sku="sku_pla_jet_black") == "materialy"
    assert normalize_category_slug("Chemia warsztatowa", sku="sku_magigoo_original") == "materialy"
    assert normalize_category_slug("Narzędzia", sku="sku_deburring_tool") == "narzedzia"


def test_legacy_labels_normalize_without_sku():
    assert normalize_category_slug("Akcesoria DFM") == "hardware"
    assert normalize_category_slug("filamenty") == "materialy"
    assert normalize_category_slug("zabawki użytkowe") == "gotowe-printy"


def test_parse_filter_rejects_unknown():
    assert parse_category_filter("") is None
    assert parse_category_filter("hardware") == "hardware"
    assert parse_category_filter("Materiały") == "materialy"
    try:
        parse_category_filter("litofany")
    except ValueError as err:
        assert "litofany" in str(err)
    else:
        raise AssertionError("expected ValueError")


def test_counts_keep_empty_gotowe_printy():
    products = [
        {"sku": "sku_brass_inserts", "category": "hardware", "active": True},
        {"sku": "sku_pla_jet_black", "category": "materialy", "active": True},
        {"sku": "inactive", "category": "akcesoria", "active": False},
    ]
    counts = {item["slug"]: item["count"] for item in build_category_counts(products)}
    assert counts["hardware"] == 1
    assert counts["materialy"] == 1
    assert counts["gotowe-printy"] == 0
    assert counts["akcesoria"] == 0
    assert category_label("gotowe-printy") == "Gotowe printy"
