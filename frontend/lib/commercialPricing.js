/**
 * Commercial print quote — keep defaults in sync with backend/pricing.py.
 *
 * unit = max(MIN_UNIT_PRICE_PLN,
 *   grams × (zł/kg / 1000) × layer × nozzle × MATERIAL_MARKUP
 *   + hours × MACHINE_HOURLY_PLN
 *   + SETUP_FEE_PLN)
 *
 * Wholesale zł/kg is calculator-only and must not be rendered in public UI.
 * Weight/time stay truthful; this module is the price layer only.
 *
 * Public PLN is the commercial amount shown in studio (no second VAT pass
 * in the cart). Treat it as the amount the customer pays for the print line.
 *
 * Tuned so whale_stl.stl (~57.2 g, ~5.45 h, PLA 45 zł/kg) ≈ 12.60 PLN
 * (competitor ballpark 12.02 PLN gross), not raw plastic 2.57 PLN.
 */

const MATERIAL_MARKUP = 2.0;
const MACHINE_HOURLY_PLN = 1.0;
const SETUP_FEE_PLN = 2.0;
const MIN_UNIT_PRICE_PLN = 0.8;
const MINIMUM_ORDER_VALUE_PLN = 30.0;

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseFormattedPrintTime(formatted) {
  if (!formatted) return 0;
  const s = String(formatted).toLowerCase();
  const days = /(\d+)\s*d/.exec(s);
  const hrs = /(\d+)\s*h/.exec(s);
  const mins = /(\d+)\s*m/.exec(s);
  return (
    (days ? Number(days[1]) * 24 : 0) +
    (hrs ? Number(hrs[1]) : 0) +
    (mins ? Number(mins[1]) / 60 : 0)
  );
}

/**
 * One time source for price. Prefer Bambu prediction seconds, then the
 * formatted time shown in the studio bar, then a numeric hours field.
 *
 * Numeric hours must NOT win over "5h 6m" — leftover geometry estimates
 * (e.g. 7.63 h) were pricing Photoset at 22.84 while the bar still showed 5h 6m.
 */
function canonicalPrintTimeHours({ formatted, hours, seconds } = {}) {
  const sec = Number(seconds);
  if (Number.isFinite(sec) && sec > 0) {
    return Math.round((sec / 3600) * 100) / 100;
  }
  const fromFormatted = parseFormattedPrintTime(formatted);
  if (fromFormatted > 0) return fromFormatted;
  const numeric = Number(hours);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 0;
}

function parsePrintTimeHours(formatted, hours, seconds) {
  return canonicalPrintTimeHours({ formatted, hours, seconds });
}

function commercialUnitPrice({
  weightG = 0,
  printTimeHours = 0,
  ratePerG = 0.045,
  layerMultiplier = 1,
  nozzleMultiplier = 1,
} = {}) {
  const grams = Math.max(0, Number(weightG) || 0);
  const hours = Math.max(0, Number(printTimeHours) || 0);
  const materialCost = grams * ratePerG * layerMultiplier * nozzleMultiplier;
  const raw = materialCost * MATERIAL_MARKUP + hours * MACHINE_HOURLY_PLN + SETUP_FEE_PLN;
  return Math.max(MIN_UNIT_PRICE_PLN, roundMoney(raw));
}

/** Sum of stored line totals. Do not multiply by 1.23 — quoted PLN is the line amount. */
function cartQuotedTotal(items) {
  if (!Array.isArray(items)) return 0;
  return roundMoney(items.reduce((acc, item) => acc + (Number(item.total_price) || 0), 0));
}

module.exports = {
  MATERIAL_MARKUP,
  MACHINE_HOURLY_PLN,
  SETUP_FEE_PLN,
  MIN_UNIT_PRICE_PLN,
  MINIMUM_ORDER_VALUE_PLN,
  roundMoney,
  parseFormattedPrintTime,
  canonicalPrintTimeHours,
  parsePrintTimeHours,
  commercialUnitPrice,
  cartQuotedTotal,
};
