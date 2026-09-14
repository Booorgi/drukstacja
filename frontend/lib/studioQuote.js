import commercialPricing from "./commercialPricing";
import quoteSync from "./quoteSync.cjs";

const { commercialUnitPrice, canonicalPrintTimeHours } = commercialPricing;

/** Objętość 0 / null nie jest pomiarem — historyczny `|| 32.5` dawał 16 g przy 6% infill. */
export const MIN_RELIABLE_VOLUME_CM3 = quoteSync.MIN_RELIABLE_VOLUME_CM3;
export const BAMBU_SLICE_ENGINE = quoteSync.BAMBU_SLICE_ENGINE;
export const SLICE_INFO_QUOTE_NOTE = "Waga i czas ze slicera 3MF.";
export const mergeAnalyzeWithPeekedSliceQuote = quoteSync.mergeAnalyzeWithPeekedSliceQuote;

export const LARGE_3MF_QUOTE_NO_PREVIEW_MSG =
  "Plik wczytany. Ustawienia zapisane. Wycena gotowa. Podgląd niemożliwy ze względu na dużą objętość siatki / CPS.";

export const LARGE_3MF_NO_QUOTE_NO_PREVIEW_MSG =
  "Plik wczytany. Ustawienia zapisane. Automatyczna wycena wymaga geometrii siatki — bez niej nie podajemy wagi ani ceny. Podgląd niemożliwy ze względu na dużą objętość siatki / CPS.";

export const LARGE_3MF_QUOTE_THUMBNAIL_MSG =
  "Plik wczytany. Ustawienia zapisane. Wycena gotowa. Podgląd 3D pominięty ze względu na dużą objętość siatki / CPS. Pokazujemy miniaturę zapisaną w pliku 3MF.";

export const LARGE_3MF_NO_QUOTE_THUMBNAIL_MSG =
  "Plik wczytany. Ustawienia zapisane. Automatyczna wycena wymaga geometrii siatki — bez niej nie podajemy wagi ani ceny. Podgląd 3D pominięty ze względu na dużą objętość siatki / CPS. Pokazujemy miniaturę zapisaną w pliku 3MF.";

export function isReliableVolumeCm3(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > MIN_RELIABLE_VOLUME_CM3;
}

export const isBambuSliceQuote = quoteSync.isBambuSliceQuote;

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
  if (isBambuSliceQuote(analysisData)) return true;
  return isReliableVolumeCm3(analysisData.source_volume_cm3 ?? analysisData.volume_cm3);
}

export function isPreviewSkipped(analysisData, previewUrl) {
  if (previewUrl) return false;
  if (!analysisData) return false;
  return Boolean(analysisData.preview_skipped || analysisData.skipped_geometry);
}

export function studioPreviewImageUrl(analysisData, localImageUrl) {
  if (localImageUrl) return localImageUrl;
  const url = analysisData?.preview_image_url;
  return typeof url === "string" && url.trim() ? url : null;
}

export function formatPrintTimeFromSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total >= 86400) {
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
  if (total >= 3600) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (total >= 60) {
    return `${Math.floor(total / 60)}m`;
  }
  return total > 0 ? `${total}s` : "0m";
}

/** Wycena z Metadata/slice_info.config odczytanego w przeglądarce (zanim wróci API). */
export function quoteAnalysisFromPeekedSliceInfo({
  profile,
  sliceStats,
  fileName,
  ratePerG = 0.045,
  previewImageUrl = null,
} = {}) {
  const grams = Number(sliceStats && sliceStats.filament_weight_g);
  if (!Number.isFinite(grams) || grams <= MIN_RELIABLE_VOLUME_CM3) return null;
  const seconds = Number(sliceStats.print_time_seconds) || 0;
  const hours = canonicalPrintTimeHours({ seconds });
  const unit = commercialUnitPrice({
    weightG: grams,
    printTimeHours: hours,
    ratePerG: Number(ratePerG) || 0.045,
  });
  const hasThumb = Boolean(previewImageUrl);
  return {
    instant_pricing: true,
    skipped_geometry: false,
    skipped_heavy_mesh: true,
    skipped_colored_preview: true,
    preview_skipped: true,
    quote_ready: true,
    type: "3d_model",
    original_filename: fileName,
    file_profile: profile || {},
    slicer_engine: BAMBU_SLICE_ENGINE,
    quote_source: BAMBU_SLICE_ENGINE,
    filament_weight_g: grams,
    filament_length_m: Number(sliceStats.filament_length_m) || 0,
    print_time_seconds: seconds,
    print_time_hours: hours,
    print_time_formatted: formatPrintTimeFromSeconds(seconds),
    price_breakdown: { unit_price_pln: unit, engine: "commercial-margin-v1" },
    unit_price: unit,
    preview_image_url: previewImageUrl || undefined,
    message: hasThumb
      ? `${LARGE_3MF_QUOTE_THUMBNAIL_MSG} ${SLICE_INFO_QUOTE_NOTE}`
      : `${LARGE_3MF_QUOTE_NO_PREVIEW_MSG} ${SLICE_INFO_QUOTE_NOTE}`,
  };
}

export const ANALYZE_TIMEOUT_RFQ_MSG =
  "Nie udało się doliczyć automatycznej wyceny tego 3MF (limit czasu serwera). Możesz spróbować ponownie albo wysłać plik do wyceny inżynierskiej.";
