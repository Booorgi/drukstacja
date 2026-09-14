const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  PRINT_BED_MM,
  sourceDimensionsMm,
  scaledDimensionsMm,
  isOverPrintBed,
  oversizeAxes,
  fitToPrintBedPercent,
  printBedFitsAtScale,
} = require("./printBed");

describe("printBed", () => {
  it("uses a 256 mm cube bed", () => {
    assert.equal(PRINT_BED_MM, 256);
  });

  it("prefers source_dimensions_mm over already-displayed dims", () => {
    assert.deepEqual(
      sourceDimensionsMm({
        source_dimensions_mm: [388.6, 343.1, 393.9],
        dimensions_mm: [100, 100, 100],
      }),
      [388.6, 343.1, 393.9]
    );
  });

  it("flags the monstera screenshot as oversized at 100%", () => {
    const source = [388.6, 343.1, 393.9];
    const scaled = scaledDimensionsMm(source, 1);
    assert.equal(isOverPrintBed(scaled), true);
    assert.deepEqual(oversizeAxes(scaled), { x: true, y: true, z: true });
  });

  it("fits uniformly under the bed without rounding back over 256", () => {
    const source = [388.6, 343.1, 393.9];
    const percent = fitToPrintBedPercent(source);
    assert.equal(percent, 64);
    assert.equal(printBedFitsAtScale(source, percent), true);
    assert.equal(printBedFitsAtScale(source, percent + 1), false);
    const fitted = scaledDimensionsMm(source, percent / 100);
    assert.ok(Math.max(...fitted) <= PRINT_BED_MM);
  });

  it("rechecks after scale: a 200 mm cube is fine at 100% and blocked at 200%", () => {
    const source = [200, 200, 200];
    assert.equal(printBedFitsAtScale(source, 100), true);
    assert.equal(printBedFitsAtScale(source, 128), true);
    assert.equal(printBedFitsAtScale(source, 129), false);
    assert.equal(fitToPrintBedPercent(source), 128);
  });

  it("allows a model that sits exactly on the 256 mm limit", () => {
    assert.equal(isOverPrintBed([256, 256, 256]), false);
    assert.equal(isOverPrintBed([256.01, 10, 10]), true);
  });

  it("treats missing geometry as not oversized so skipped-preview quotes still work", () => {
    assert.deepEqual(sourceDimensionsMm({}), [0, 0, 0]);
    assert.equal(isOverPrintBed([0, 0, 0]), false);
  });
});
