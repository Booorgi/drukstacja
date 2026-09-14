const MIN_BAMBU_SLICE_WEIGHT_G = 0.05;
const MIN_3MF_MESH_PAYLOAD_BYTES = 8192;

function parse3mfSliceInfoXml(text) {
  const xml = String(text || "");
  if (!xml.trim()) return null;
  const predMatch = xml.match(/key=["']prediction["']\s+value=["']([^"']+)["']/i);
  const weightMatch = xml.match(/key=["']weight["']\s+value=["']([^"']+)["']/i);
  let usedG = 0;
  let usedM = 0;
  let slots = 0;
  const filRe = /<filament\b([^>]*)>/gi;
  let m;
  while ((m = filRe.exec(xml))) {
    const attrs = m[1] || "";
    const g = parseFloat((attrs.match(/used_g=["']([^"']+)["']/i) || [])[1]);
    const meters = parseFloat((attrs.match(/used_m=["']([^"']+)["']/i) || [])[1]);
    const gv = Number.isFinite(g) ? g : 0;
    const mv = Number.isFinite(meters) ? meters : 0;
    if (gv > MIN_BAMBU_SLICE_WEIGHT_G || mv > 0.05) {
      usedG += gv;
      usedM += mv;
      slots += 1;
    }
  }
  const weightFromFilament = usedG;
  const weightFromMeta = parseFloat(weightMatch && weightMatch[1]);
  const weight = weightFromFilament > 0 ? weightFromFilament : (Number.isFinite(weightFromMeta) ? weightFromMeta : 0);
  const secondsRaw = parseFloat(predMatch && predMatch[1]);
  const seconds = Number.isFinite(secondsRaw) ? Math.round(secondsRaw) : 0;
  const hasWeight = Number.isFinite(weight) && weight > MIN_BAMBU_SLICE_WEIGHT_G;
  const hasTime = seconds >= 1;
  if (!hasWeight && !(hasTime && usedM > 0.05)) return null;
  return {
    filament_weight_g: hasWeight ? Math.round(weight * 100) / 100 : 0,
    filament_length_m: Math.round(usedM * 100) / 100,
    print_time_seconds: seconds,
    color_count: Math.max(slots, 1),
  };
}

function canQuoteFromPeekedSliceInfo(sliceStats, maxModelUncompressed) {
  const grams = Number(sliceStats && sliceStats.filament_weight_g);
  if (!Number.isFinite(grams) || grams <= MIN_BAMBU_SLICE_WEIGHT_G) return false;
  return Number(maxModelUncompressed) >= MIN_3MF_MESH_PAYLOAD_BYTES;
}

module.exports = {
  MIN_BAMBU_SLICE_WEIGHT_G,
  MIN_3MF_MESH_PAYLOAD_BYTES,
  parse3mfSliceInfoXml,
  canQuoteFromPeekedSliceInfo,
};
