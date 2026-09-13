const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  lerp,
  clampScrubTime,
  nextScrubTime,
  heroScrollProgress,
  SCRUB_SNAP,
} = require("./printerLayersBandScrub");

test("lerp interpolates toward the target", () => {
  assert.equal(lerp(0, 10, 0.2), 2);
  assert.equal(lerp(4, 8, 0.5), 6);
});

test("clampScrubTime stays inside the clip and off the last frame", () => {
  assert.equal(clampScrubTime(-1, 10), 0);
  assert.equal(clampScrubTime(4, 10), 4);
  assert.equal(clampScrubTime(10, 10), 9.96);
  assert.equal(clampScrubTime(1, Number.NaN), 0);
});

test("nextScrubTime eases then snaps when close", () => {
  assert.equal(nextScrubTime(0, 1, 0.22, 0.035), 0.22);
  assert.equal(nextScrubTime(0.99, 1, 0.22, 0.035), 1);
  assert.ok(Math.abs(nextScrubTime(0, SCRUB_SNAP, 0.22, SCRUB_SNAP) - SCRUB_SNAP) < 1e-9);
});

test("heroScrollProgress maps scroll through the hero", () => {
  const section = { offsetTop: 0, offsetHeight: 1000 };
  assert.equal(heroScrollProgress(section, 0), 0);
  assert.equal(heroScrollProgress(section, 450), 0.5);
  assert.equal(heroScrollProgress(section, 900), 1);
  assert.equal(heroScrollProgress(section, 2000), 1);
  assert.equal(heroScrollProgress(null, 100), 0);
});
