const MIN_BAMBU_SLICE_WEIGHT_G = 0.05;
const MIN_3MF_MESH_PAYLOAD_BYTES = 8192;

function parse3mfSliceInfoXml(text) {
  const xml = String(text || "");
  if (!xml.trim()) return null;

  // Sumuj wszystkie płyty (Print all) — nie tylko pierwszą.
  let predictionS = 0;
  let weightMeta = 0;
  let plateCount = 0;
  const plateRe = /<plate\b[^>]*>([\s\S]*?)<\/plate>/gi;
  let plateMatch;
  const plateBodies = [];
  while ((plateMatch = plateRe.exec(xml))) {
    plateBodies.push(plateMatch[1] || "");
  }
  const scopes = plateBodies.length ? plateBodies : [xml];

  let usedG = 0;
  let usedM = 0;
  let slots = 0;

  for (const body of scopes) {
    const predMatch = body.match(/key=["']prediction["']\s+value=["']([^"']+)["']/i);
    const weightMatch = body.match(/key=["']weight["']\s+value=["']([^"']+)["']/i);
    const platePred = parseFloat(predMatch && predMatch[1]);
    const plateWeight = parseFloat(weightMatch && weightMatch[1]);
    let plateUsedG = 0;
    let plateUsedM = 0;
    let plateSlots = 0;
    const filRe = /<filament\b([^>]*)>/gi;
    let m;
    while ((m = filRe.exec(body))) {
      const attrs = m[1] || "";
      const g = parseFloat((attrs.match(/used_g=["']([^"']+)["']/i) || [])[1]);
      const meters = parseFloat((attrs.match(/used_m=["']([^"']+)["']/i) || [])[1]);
      const gv = Number.isFinite(g) ? g : 0;
      const mv = Number.isFinite(meters) ? meters : 0;
      if (gv > MIN_BAMBU_SLICE_WEIGHT_G || mv > 0.05) {
        plateUsedG += gv;
        plateUsedM += mv;
        plateSlots += 1;
      }
    }
    const plateTotalG = Math.max(
      plateUsedG > 0 ? plateUsedG : 0,
      Number.isFinite(plateWeight) ? plateWeight : 0
    );
    if (plateTotalG <= MIN_BAMBU_SLICE_WEIGHT_G && !(Number.isFinite(platePred) && platePred >= 1)) {
      continue;
    }
    plateCount += 1;
    if (Number.isFinite(platePred) && platePred > 0) predictionS += platePred;
    if (Number.isFinite(plateWeight) && plateWeight > 0) weightMeta += plateWeight;
    usedG += plateUsedG;
    usedM += plateUsedM;
    slots += plateSlots;
  }

  const weight = Math.max(
    usedG > 0 ? usedG : 0,
    weightMeta > 0 ? weightMeta : 0
  );
  const seconds = Number.isFinite(predictionS) ? Math.round(predictionS) : 0;
  const hasWeight = Number.isFinite(weight) && weight > MIN_BAMBU_SLICE_WEIGHT_G;
  const hasTime = seconds >= 1;
  if (!hasWeight && !(hasTime && usedM > 0.05)) return null;
  return {
    filament_weight_g: hasWeight ? Math.round(weight * 100) / 100 : 0,
    filament_length_m: Math.round(usedM * 100) / 100,
    print_time_seconds: seconds,
    color_count: Math.max(slots, 1),
    plate_count: Math.max(plateCount, 1),
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
