const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_TILT,
  dampenTilt,
  mapOrientationToTilt,
  needsOrientationPermission,
} = require("./deviceTilt");

describe("deviceTilt", () => {
  it("maps gamma to z and beta (minus hold angle) to x", () => {
    const level = mapOrientationToTilt(45, 0);
    assert.equal(level.x, 0);
    assert.equal(level.z, 0);

    const rolled = mapOrientationToTilt(45, 25);
    assert.ok(rolled.z > 0);
    assert.equal(rolled.x, 0);

    const pitched = mapOrientationToTilt(70, 0);
    assert.ok(pitched.x > 0);
    assert.equal(pitched.z, 0);
  });

  it("clamps to the same max tilt as drag", () => {
    const hard = mapOrientationToTilt(180, 180);
    assert.equal(hard.x, MAX_TILT);
    assert.equal(hard.z, MAX_TILT);

    const other = mapOrientationToTilt(-90, -180);
    assert.equal(other.x, -MAX_TILT);
    assert.equal(other.z, -MAX_TILT);
  });

  it("dampens toward the next sample", () => {
    const next = { x: 1, z: -1 };
    const stepped = dampenTilt({ x: 0, z: 0 }, next, 0.2);
    assert.ok(stepped.x > 0 && stepped.x < 1);
    assert.ok(stepped.z < 0 && stepped.z > -1);
    assert.equal(stepped.x, 0.2);
    assert.equal(stepped.z, -0.2);
  });

  it("detects iOS permission gate only when requestPermission exists", () => {
    assert.equal(needsOrientationPermission({}), false);
    assert.equal(needsOrientationPermission({ DeviceOrientationEvent: function DeviceOrientationEvent() {} }), false);
    const DOE = function DeviceOrientationEvent() {};
    DOE.requestPermission = async () => "granted";
    assert.equal(needsOrientationPermission({ DeviceOrientationEvent: DOE }), true);
  });
});
