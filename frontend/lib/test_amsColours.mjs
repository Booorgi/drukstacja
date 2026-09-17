import {
  formatAmsMaterialLabel,
  normalizeAmsColours,
  replaceAmsSlot,
  scaleLengthForDensity,
  scaleWeightForDensity,
  updateAmsSlot,
} from "./amsColours.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test_normalize_and_update() {
  assert(normalizeAmsColours(["#fff", "red", "#00FF00"]).length === 2, "filter hex");
  assert(updateAmsSlot(["#111111", "#222222"], 1, "#ABCDEF")[1] === "#ABCDEF", "update slot");
  assert(updateAmsSlot([], 0, "#ABCDEF")[0] === "#ABCDEF", "grow empty");
}

function test_replace_seeds_from_fallback() {
  const next = replaceAmsSlot([], ["#111111", "#222222"], 1, "#ABCDEF");
  assert(next[0] === "#111111", "keep slot 0");
  assert(next[1] === "#ABCDEF", "replace slot 1");
}

function test_density_scale() {
  assert(scaleWeightForDensity(100, 1.24) === 100, "pla identity");
  assert(scaleWeightForDensity(100, 1.27) === 102.4, "petg-ish scale");
  assert(scaleLengthForDensity(50, 1.24) === 50, "length identity");
}

function test_label() {
  assert(
    formatAmsMaterialLabel("PETG Standard", ["#FF0000", "#00FF00"]) ===
      "PETG Standard (AMS: #FF0000, #00FF00)",
    "ams label"
  );
}

test_normalize_and_update();
test_replace_seeds_from_fallback();
test_density_scale();
test_label();
console.log("amsColours tests: ok");
