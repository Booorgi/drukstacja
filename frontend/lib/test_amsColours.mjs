import {
  formatAmsMaterialLabel,
  normalizeAmsColours,
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
  assert(updateAmsSlot(["#111111"], 5, "#ABCDEF")[0] === "#111111", "ignore OOB");
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
test_density_scale();
test_label();
console.log("amsColours tests: ok");
