const SEEK_EPSILON = 0.01;
const SCRUB_LERP = 0.22;
const SCRUB_SNAP = 0.035;
const SCRUB_END_PAD = 0.04;
const SCROLL_RANGE_FACTOR = 0.9;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clampScrubTime(time, duration, pad = SCRUB_END_PAD) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(Math.max(time, 0), Math.max(duration - pad, 0));
}

/** Ease currentTime toward the scroll target; snap when close to avoid hunting. */
function nextScrubTime(current, target, lerpFactor = SCRUB_LERP, snap = SCRUB_SNAP) {
  const delta = target - current;
  if (!Number.isFinite(delta) || Math.abs(delta) <= snap) return target;
  return lerp(current, target, lerpFactor);
}

/** 0 at the top of the hero, 1 after the user has scrolled through it. */
function heroScrollProgress(section, scrollY = 0) {
  if (!section) return 0;
  const top = typeof section.offsetTop === "number" ? section.offsetTop : 0;
  const height = typeof section.offsetHeight === "number" ? section.offsetHeight : 0;
  const start = Math.max(0, top);
  const range = Math.max(1, height * SCROLL_RANGE_FACTOR);
  return Math.min(1, Math.max(0, (scrollY - start) / range));
}

module.exports = {
  SEEK_EPSILON,
  SCRUB_LERP,
  SCRUB_SNAP,
  SCRUB_END_PAD,
  SCROLL_RANGE_FACTOR,
  lerp,
  clampScrubTime,
  nextScrubTime,
  heroScrollProgress,
};
