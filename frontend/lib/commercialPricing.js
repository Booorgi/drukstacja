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
 * Tuned so whale_stl.stl (~57.2 g, ~5.45 h, PLA 45 zł/kg) ≈ 12.60 PLN
 * (competitor ballpark 12.02 PLN gross), not raw plastic 2.57 PLN.
 */

export const MATERIAL_MARKUP = 2.0;
export const MACHINE_HOURLY_PLN = 1.0;
export const SETUP_FEE_PLN = 2.0;
export const MIN_UNIT_PRICE_PLN = 0.8;
export const MINIMUM_ORDER_VALUE_PLN = 30.0;

export function parsePrintTimeHours(formatted, hours) {
  const numeric = Number(hours);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
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

export function commercialUnitPrice({
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
  return Math.max(MIN_UNIT_PRICE_PLN, raw);
}
