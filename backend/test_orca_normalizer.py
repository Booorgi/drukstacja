import json
import os
import tempfile
import zipfile

from slicer import ORCA_LAYER_RESET_GCODE, normalize_orca_3mf_project


def _write_3mf(path: str, files: dict[str, str]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)


def _read_config_from_3mf(path: str, member: str) -> dict:
    with zipfile.ZipFile(path, "r") as zf:
        return json.loads(zf.read(member).decode("utf-8"))


def test_normalize_injects_layer_reset_for_relative_e_machine():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        machine = {
            "type": "machine",
            "use_relative_e_distances": True,
            "layer_change_gcode": "M117 layer\n",
        }
        _write_3mf(
            source,
            {
                "Metadata/machine.config": json.dumps(machine),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        config = _read_config_from_3mf(normalized, "Metadata/machine.config")
        assert config["layer_change_gcode"] == ORCA_LAYER_RESET_GCODE


def test_normalize_adds_layer_reset_when_missing():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        machine = {
            "type": "machine",
            "use_relative_e_distances": True,
        }
        _write_3mf(
            source,
            {
                "Metadata/machine.config": json.dumps(machine),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        config = _read_config_from_3mf(normalized, "Metadata/machine.config")
        assert config["before_layer_change_gcode"] == ORCA_LAYER_RESET_GCODE


def test_normalize_strips_timelapse_gcode_with_bambu_template_syntax():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        machine = {
            "type": "machine",
            "use_relative_e_distances": True,
            "Timelapse G-code": "M117 start\n{if timelapse_inline_photo}\nM1002\n{endif}\n",
            "printable_area": [0, 0, 256, 256],
        }
        _write_3mf(
            source,
            {
                "Metadata/machine.json": json.dumps(machine),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        config = _read_config_from_3mf(normalized, "Metadata/machine.json")
        assert "Timelapse G-code" not in config
        assert "timelapse_gcode" not in config
        assert config["printable_area"] == [0, 0, 256, 256]


def test_normalize_clamps_zero_sparse_infill_speed():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        process = {
            "type": "process",
            "sparse_infill_speed": 0,
            "outer_wall_speed": "0",
            "travel_speed": 150,
        }
        _write_3mf(
            source,
            {
                "Metadata/process.config": json.dumps(process),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        config = _read_config_from_3mf(normalized, "Metadata/process.config")
        assert config["sparse_infill_speed"] == 80
        assert config["outer_wall_speed"] == 60
        assert config["travel_speed"] == 150


def test_normalize_sanitizes_machine_start_gcode_profiles():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        machine = {
            "type": "machine",
            "use_relative_e_distances": True,
            "machine_start_gcode": "G28\n",
            "before_layer_change_gcode": "G92 E0\n",
            "printable_area": [0, 0, 256, 256],
        }
        _write_3mf(
            source,
            {
                "Metadata/printer.config": json.dumps(machine),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        config = _read_config_from_3mf(normalized, "Metadata/printer.config")
        assert "machine_start_gcode" not in config
        assert config["before_layer_change_gcode"] == ORCA_LAYER_RESET_GCODE
        assert config["printable_area"] == [0, 0, 256, 256]


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
