const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  commercialUnitPrice,
  canonicalPrintTimeHours,
  parsePrintTimeHours,
  cartQuotedTotal,
} = require("./commercialPricing");
const {
  mergeAnalyzeWithPeekedSliceQuote,
  peekedCommercialUnitPrice,
} = require("./quoteSync.cjs");

const PHOTOSET_G = 146.74;
const PHOTOSET_S = 18372;
const PHOTOSET_FORMATTED = "5h 6m";

test("Photoset commercial unit is 20.31, not 22.84 from stale hours", () => {
  const hours = canonicalPrintTimeHours({
    formatted: PHOTOSET_FORMATTED,
    hours: 7.633,
    seconds: PHOTOSET_S,
  });
  const unit = commercialUnitPrice({
    weightG: PHOTOSET_G,
    printTimeHours: hours,
    ratePerG: 0.045,
  });
  assert.equal(unit, 20.31);
  const stale = commercialUnitPrice({
    weightG: PHOTOSET_G,
    printTimeHours: 7.633,
    ratePerG: 0.045,
  });
  assert.equal(Math.round(stale * 100) / 100, 22.84);
});

test("parsePrintTimeHours prefers formatted 5h 6m over geometry 7.63 h", () => {
  assert.equal(parsePrintTimeHours(PHOTOSET_FORMATTED, 7.633), 5.1);
});

test("studio quote == cart unit == cart total for qty 1", () => {
  const studio = commercialUnitPrice({
    weightG: PHOTOSET_G,
    printTimeHours: parsePrintTimeHours(PHOTOSET_FORMATTED, 7.633, PHOTOSET_S),
    ratePerG: 0.045,
  });
  const line = { total_price: studio, quantity: 1 };
  const cart = cartQuotedTotal([line]);
  assert.equal(studio, 20.31);
  assert.equal(cart, studio);
  assert.notEqual(Math.round(cart * 1.23 * 100) / 100, cart);
});

test("cart total does not add 23% VAT on quoted PLN", () => {
  const items = [{ total_price: 35.02 }, { total_price: 2.0 }];
  assert.equal(cartQuotedTotal(items), 37.02);
  assert.notEqual(cartQuotedTotal(items), 45.53);
});

test("peeked 3MF quote uses commercial formula, not grams × 0.27", () => {
  const unit = peekedCommercialUnitPrice({
    grams: PHOTOSET_G,
    seconds: PHOTOSET_S,
    ratePerG: 0.045,
  });
  assert.equal(unit, 20.31);
  assert.notEqual(unit, 39.62);
});

test("analyze merge keeps peeked 5h 6m when API sends 7.63 h leftover", () => {
  const peeked = {
    slicer_engine: "bambu-slice-info",
    filament_weight_g: PHOTOSET_G,
    filament_length_m: 49.2,
    print_time_seconds: PHOTOSET_S,
    print_time_hours: 5.1,
    print_time_formatted: PHOTOSET_FORMATTED,
    price_breakdown: { unit_price_pln: 20.31 },
    unit_price: 20.31,
  };
  const merged = mergeAnalyzeWithPeekedSliceQuote(
    {
      slicer_engine: "geometry-estimate",
      filament_weight_g: PHOTOSET_G,
      print_time_hours: 7.633,
      print_time_formatted: PHOTOSET_FORMATTED,
      preview_stl_url: "/api/cached-model/x.stl",
    },
    peeked
  );
  assert.equal(merged.print_time_formatted, PHOTOSET_FORMATTED);
  assert.ok(Math.abs(merged.print_time_hours - 5.1) < 0.02);
  assert.equal(merged.slicer_engine, "bambu-slice-info");
  const price = commercialUnitPrice({
    weightG: merged.filament_weight_g,
    printTimeHours: merged.print_time_hours,
    ratePerG: 0.045,
  });
  assert.equal(price, 20.31);
});
