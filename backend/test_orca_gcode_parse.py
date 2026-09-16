import json
import os
import tempfile
import zipfile

from slicer import collect_orca_slice_stats, parse_gcode_slice_stats


ORCA_FOOTER = """
; EXECUTABLE_BLOCK_END

; filament used [mm] = 1509.16
; filament used [cm3] = 3.63
; filament used [g] = 4.50
; filament cost = 0.09
; total filament used [g] = 4.50
; total filament cost = 0.09
; total layers count = 110
; estimated printing time (normal mode) = 16m 58s
"""


def test_parse_orca_footer_after_executable_block():
    stats = parse_gcode_slice_stats(ORCA_FOOTER, "PLA")
    assert stats["filament_weight_g"] == 4.50
    assert stats["filament_length_m"] == 1.51
    assert stats["print_time_formatted"] == "16m"
    assert 0.27 <= stats["print_time_hours"] <= 0.29


def test_collect_orca_stats_from_gcode_3mf_slice_info():
    with tempfile.TemporaryDirectory() as tmp:
        archive = os.path.join(tmp, "wizard.gcode.3mf")
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                "Metadata/slice_info.config",
                """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="prediction" value="1018"/>
    <metadata key="weight" value="12.40"/>
    <filament id="1" type="PLA" color="#000000" used_m="4.10" used_g="12.40"/>
  </plate>
</config>
""",
            )
            zf.writestr("Metadata/plate_1.gcode", ORCA_FOOTER)
        stats = collect_orca_slice_stats(
            tmp,
            infill=15,
            layer_height=0.20,
            nozzle_size=0.4,
            filament_type="PLA",
        )
        assert stats is not None
        assert stats["engine"] == "orca-slicer-cli"
        assert abs(stats["filament_weight_g"] - 12.40) < 0.01
        assert stats["print_time_formatted"] == "16m"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
