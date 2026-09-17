const { parse3mfSliceInfoXml } = require("./peek3mfSliceInfo.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

const multi = `<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="prediction" value="3600"/>
    <metadata key="weight" value="40.0"/>
    <filament id="1" used_m="13.4" used_g="40.0"/>
  </plate>
  <plate>
    <metadata key="prediction" value="7200"/>
    <metadata key="weight" value="80.0"/>
    <filament id="1" used_m="26.8" used_g="50.0"/>
    <filament id="2" used_m="10.0" used_g="30.0"/>
  </plate>
</config>`;

const stats = parse3mfSliceInfoXml(multi);
assert(stats.plate_count === 2, "plate_count");
assert(Math.abs(stats.filament_weight_g - 120) < 0.05, `weight=${stats.filament_weight_g}`);
assert(stats.print_time_seconds === 10800, `time=${stats.print_time_seconds}`);
assert(Math.abs(stats.filament_length_m - 50.2) < 0.05, `len=${stats.filament_length_m}`);
console.log("peek3mfSliceInfo multi-plate: ok");
