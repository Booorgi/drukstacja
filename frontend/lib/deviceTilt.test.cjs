const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_TILT,
  dampenTilt,
  isIosDevice,
  isIosOrientationGate,
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

  it("detects iOS permission gate only on iOS + requestPermission", () => {
    assert.equal(needsOrientationPermission({}), false);
    assert.equal(needsOrientationPermission({ DeviceOrientationEvent: function DeviceOrientationEvent() {} }), false);
    const DOE = function DeviceOrientationEvent() {};
    DOE.requestPermission = async () => "granted";
    const desktop = {
      DeviceOrientationEvent: DOE,
      navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120", platform: "MacIntel", maxTouchPoints: 0 },
    };
    const iphone = {
      DeviceOrientationEvent: DOE,
      navigator: {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
    };
    assert.equal(needsOrientationPermission(desktop), true);
    assert.equal(isIosDevice(desktop), false);
    assert.equal(isIosOrientationGate(desktop), false);
    assert.equal(isIosDevice(iphone), true);
    assert.equal(isIosOrientationGate(iphone), true);
  });
});
