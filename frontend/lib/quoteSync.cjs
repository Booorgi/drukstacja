const {
  canonicalPrintTimeHours,
  commercialUnitPrice,
} = require("./commercialPricing");

const BAMBU_SLICE_ENGINE = "bambu-slice-info";
const MIN_RELIABLE_VOLUME_CM3 = 0.05;

function isBambuSliceQuote(analysisData) {
  if (!analysisData) return false;
  const engine = analysisData.slicer_engine || analysisData.quote_source;
  if (engine !== BAMBU_SLICE_ENGINE) return false;
  const grams = Number(analysisData.filament_weight_g);
  return Number.isFinite(grams) && grams > MIN_RELIABLE_VOLUME_CM3;
}

/**
 * Browser peek of slice_info is the commercial source for a 3MF.
 * /api/analyze-model must not replace 146.74 g / 5h 6m with a geometry
 * hours leftover (that was 20.31 vs 22.84 on Photoset).
 */
function mergeAnalyzeWithPeekedSliceQuote(apiData, peekedSliceQuote) {
  const api = apiData && typeof apiData === "object" ? { ...apiData } : {};
  if (!isBambuSliceQuote(peekedSliceQuote)) return api;

  const peekSeconds = Number(peekedSliceQuote.print_time_seconds) || 0;
  const peekCanonical = canonicalPrintTimeHours({
    seconds: peekSeconds,
    formatted: peekedSliceQuote.print_time_formatted,
    hours: peekedSliceQuote.print_time_hours,
  });
  const apiCanonical = canonicalPrintTimeHours({
    seconds: api.print_time_seconds,
    formatted: api.print_time_formatted,
    hours: api.print_time_hours,
  });
  const apiIsBambu = isBambuSliceQuote(api);
  const hoursAgree =
    apiIsBambu && peekCanonical > 0 && apiCanonical > 0 && Math.abs(apiCanonical - peekCanonical) <= 0.15;
  const weightAgree =
    apiIsBambu &&
    Math.abs(Number(api.filament_weight_g) - Number(peekedSliceQuote.filament_weight_g)) < 1.0;

  if (hoursAgree && weightAgree) {
    if (!api.print_time_seconds && peekSeconds > 0) api.print_time_seconds = peekSeconds;
    return api;
  }

  return {
    ...api,
    filament_weight_g: peekedSliceQuote.filament_weight_g,
    filament_length_m: peekedSliceQuote.filament_length_m,
    print_time_seconds: peekSeconds || api.print_time_seconds,
    print_time_hours: peekCanonical,
    print_time_formatted: peekedSliceQuote.print_time_formatted,
    slicer_engine: BAMBU_SLICE_ENGINE,
    quote_source: BAMBU_SLICE_ENGINE,
    instant_pricing: true,
    quote_ready: true,
    price_breakdown: peekedSliceQuote.price_breakdown || api.price_breakdown,
    unit_price: peekedSliceQuote.unit_price ?? api.unit_price,
  };
}

function peekedCommercialUnitPrice({ grams, seconds, ratePerG = 0.045 } = {}) {
  const hours = canonicalPrintTimeHours({ seconds });
  return commercialUnitPrice({
    weightG: grams,
    printTimeHours: hours,
    ratePerG: Number(ratePerG) || 0.045,
  });
}

module.exports = {
  BAMBU_SLICE_ENGINE,
  MIN_RELIABLE_VOLUME_CM3,
  isBambuSliceQuote,
  mergeAnalyzeWithPeekedSliceQuote,
  peekedCommercialUnitPrice,
};
