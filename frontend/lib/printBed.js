/** Bambu / Drukstacja FDM bed used by the quote studio. */
const PRINT_BED_MM = 256;

function asTriple(values) {
  const list = Array.isArray(values) ? values : [];
  return [0, 1, 2].map((i) => {
    const n = Number(list[i]);
    return Number.isFinite(n) ? n : 0;
  });
}

function sourceDimensionsMm(analysisData) {
  if (!analysisData) return [0, 0, 0];
  return asTriple(analysisData.source_dimensions_mm || analysisData.dimensions_mm);
}

function scaledDimensionsMm(source, scale = 1) {
  const s = Number(scale);
  const factor = Number.isFinite(s) && s > 0 ? s : 1;
  return asTriple(source).map((v) => v * factor);
}

function isOverPrintBed(dimensionsMm, bedMm = PRINT_BED_MM) {
  return asTriple(dimensionsMm).some((v) => v > bedMm);
}

function oversizeAxes(dimensionsMm, bedMm = PRINT_BED_MM) {
  const dims = asTriple(dimensionsMm);
  return {
    x: dims[0] > bedMm,
    y: dims[1] > bedMm,
    z: dims[2] > bedMm,
  };
}

function fitToPrintBedPercent(sourceMm, bedMm = PRINT_BED_MM, { min = 5, max = 200 } = {}) {
  const maxDim = Math.max(0, ...asTriple(sourceMm));
  if (!(maxDim > 0)) return 100;
  const percent = Math.floor((bedMm / maxDim) * 100);
  return Math.max(min, Math.min(max, percent));
}

function printBedFitsAtScale(sourceMm, scalePercent, bedMm = PRINT_BED_MM) {
  return !isOverPrintBed(scaledDimensionsMm(sourceMm, Number(scalePercent) / 100), bedMm);
}

module.exports = {
  PRINT_BED_MM,
  asTriple,
  sourceDimensionsMm,
  scaledDimensionsMm,
  isOverPrintBed,
  oversizeAxes,
  fitToPrintBedPercent,
  printBedFitsAtScale,
};
