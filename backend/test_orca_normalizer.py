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


def test_normalize_skips_machine_start_gcode_profiles():
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.3mf")
        machine = {
            "type": "machine",
            "use_relative_e_distances": True,
            "machine_start_gcode": "G28\n",
            "before_layer_change_gcode": "G92 E0\n",
        }
        _write_3mf(
            source,
            {
                "Metadata/printer.config": json.dumps(machine),
            },
        )
        normalized = normalize_orca_3mf_project(source, tmp)
        with zipfile.ZipFile(normalized, "r") as zf:
            assert "Metadata/printer.config" not in zf.namelist()


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
