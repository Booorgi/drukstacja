from orders_api import PRINT_BED_MM, dimensions_exceed_print_bed


def test_print_bed_is_256_mm_cube():
    assert PRINT_BED_MM == 256


def test_monstera_screenshot_exceeds_bed():
    assert dimensions_exceed_print_bed([388.6, 343.1, 393.9]) is True


def test_exact_bed_and_missing_dims_are_allowed():
    assert dimensions_exceed_print_bed([256, 256, 256]) is False
    assert dimensions_exceed_print_bed([40.5, 20, 10]) is False
    assert dimensions_exceed_print_bed([0, 0, 0]) is False
    assert dimensions_exceed_print_bed(None) is False


def test_one_axis_over_limit_is_enough():
    assert dimensions_exceed_print_bed([256.2, 10, 10]) is True
    assert dimensions_exceed_print_bed([10, 300, 10]) is True
    assert dimensions_exceed_print_bed([10, 10, 256.06]) is True
