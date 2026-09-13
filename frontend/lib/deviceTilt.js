/** Max pendulum tilt (rad) — same clamp as drag on the keychain preview. */
const MAX_TILT = Math.PI / 4;

/** Holding a phone in-hand is typically ~45° from vertical. */
const HOLD_BETA_DEG = 45;

/** Scale device degrees → pendulum radians (same visual range as a short drag). */
const ORIENT_GAIN = 0.4;

/** Low-pass mix for incoming orientation (0–1). Lower = softer, less jitter. */
const TILT_DAMPEN = 0.16;

function degToRad(deg) {
  return (Number(deg) || 0) * (Math.PI / 180);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * True on iOS Safari 13+ where orientation is gated behind a user gesture.
 */
function needsOrientationPermission(globalObj = globalThis) {
  const DOE = globalObj && globalObj.DeviceOrientationEvent;
  return typeof DOE !== "undefined" && typeof DOE.requestPermission === "function";
}

function isSecureOrientationContext(globalObj = globalThis) {
  if (!globalObj) return false;
  if (typeof globalObj.isSecureContext === "boolean") return globalObj.isSecureContext;
  return true;
}

function supportsDeviceOrientation(globalObj = globalThis) {
  return Boolean(globalObj && typeof globalObj.DeviceOrientationEvent !== "undefined");
}

/**
 * Map DeviceOrientation beta/gamma onto the same X/Z pendulum targets as drag.
 * gamma (roll) → z; beta (pitch) minus a natural hold angle → x.
 */
function mapOrientationToTilt(beta, gamma, gain = ORIENT_GAIN) {
  const tiltZ = clamp(degToRad(gamma) * gain, -MAX_TILT, MAX_TILT);
  const tiltX = clamp(degToRad((Number(beta) || 0) - HOLD_BETA_DEG) * gain, -MAX_TILT, MAX_TILT);
  return { x: tiltX, z: tiltZ };
}

function dampenTilt(current, next, factor = TILT_DAMPEN) {
  const t = clamp(factor, 0, 1);
  const cx = current && Number.isFinite(current.x) ? current.x : 0;
  const cz = current && Number.isFinite(current.z) ? current.z : 0;
  return {
    x: cx + (next.x - cx) * t,
    z: cz + (next.z - cz) * t,
  };
}

module.exports = {
  MAX_TILT,
  TILT_DAMPEN,
  degToRad,
  clamp,
  needsOrientationPermission,
  isSecureOrientationContext,
  supportsDeviceOrientation,
  mapOrientationToTilt,
  dampenTilt,
};
