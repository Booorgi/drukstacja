const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parse3mfSliceInfoXml,
  canQuoteFromPeekedSliceInfo,
} = require("./peek3mfSliceInfo.cjs");

const PHOTOSET_SLICE_INFO = `<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="18372"/>
    <metadata key="weight" value="146.74"/>
    <filament id="1" trayid="1" type="PLA" color="#E05028" used_m="49.20" used_g="146.74"/>
    <model instance_id="1" identify_id="2"/>
  </plate>
</config>`;

test("parse3mfSliceInfoXml reads Photoset Bambu totals", () => {
  const stats = parse3mfSliceInfoXml(PHOTOSET_SLICE_INFO);
  assert.ok(stats);
  assert.equal(stats.filament_weight_g, 146.74);
  assert.equal(stats.filament_length_m, 49.2);
  assert.equal(stats.print_time_seconds, 18372);
});

test("leftover 16 g without mesh payload is not a peeked quote", () => {
  const stats = parse3mfSliceInfoXml(`<?xml version="1.0"?><config><plate>
    <metadata key="prediction" value="1000"/>
    <metadata key="weight" value="16"/>
    <filament id="1" type="PLA" used_m="5" used_g="16"/>
  </plate></config>`);
  assert.equal(stats.filament_weight_g, 16);
  assert.equal(canQuoteFromPeekedSliceInfo(stats, 400), false);
  assert.equal(canQuoteFromPeekedSliceInfo(stats, 50_000), true);
  assert.equal(canQuoteFromPeekedSliceInfo(null, 50_000), false);
});
