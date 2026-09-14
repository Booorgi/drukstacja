/** Objętość 0 / null nie jest pomiarem — historyczny `|| 32.5` dawał 16 g przy 6% infill. */
export const MIN_RELIABLE_VOLUME_CM3 = 0.05;

export const LARGE_3MF_QUOTE_NO_PREVIEW_MSG =
  "Plik wczytany. Ustawienia zapisane. Wycena gotowa. Podgląd niemożliwy ze względu na dużą objętość siatki / CPS.";

export const LARGE_3MF_NO_QUOTE_NO_PREVIEW_MSG =
  "Plik wczytany. Ustawienia zapisane. Automatyczna wycena wymaga geometrii siatki — bez niej nie podajemy wagi ani ceny. Podgląd niemożliwy ze względu na dużą objętość siatki / CPS.";

export function isReliableVolumeCm3(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > MIN_RELIABLE_VOLUME_CM3;
}

export function studioVolumeCm3(analysisData, modelScale = 1) {
  if (!analysisData) return 0;
  const raw = analysisData.source_volume_cm3 ?? analysisData.volume_cm3;
  if (!isReliableVolumeCm3(raw)) return 0;
  return Number(raw) * (modelScale ** 3);
}

export function isQuotedModel(analysisData) {
  if (!analysisData) return false;
  if (analysisData.instant_pricing === false) return false;
  if (analysisData.skipped_geometry || analysisData.quote_ready === false) return false;
  return isReliableVolumeCm3(analysisData.source_volume_cm3 ?? analysisData.volume_cm3);
}

export function isPreviewSkipped(analysisData, previewUrl) {
  if (previewUrl) return false;
  if (!analysisData) return false;
  return Boolean(analysisData.preview_skipped || analysisData.skipped_geometry);
}
