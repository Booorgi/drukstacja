/**
 * Czyta Metadata/project_settings.config z .3MF (ZIP) w przeglądarce,
 * bez czekania na /api/analyze-model. Dzięki temu AMS i parametry
 * pojawiają się od razu, nawet gdy geometria Jaguara jeszcze się liczy.
 */

function readU16(view, offset) {
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

function findEocdOffset(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (readU32(view, i) === 0x06054b50) return i;
  }
  return -1;
}

function decodeName(bytes) {
  return new TextDecoder("utf-8").decode(bytes).replace(/\\/g, "/");
}

async function inflateRaw(payload) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Brak DecompressionStream");
  }
  const stream = new Blob([payload]).stream().pipeThrough(
    new DecompressionStream("deflate-raw")
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function isProjectSettingsName(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith("metadata/project_settings.config") || lower === "project_settings.config";
}

export function parse3mfProjectSettingsJson(text) {
  const raw = JSON.parse(text);
  const colours = Array.isArray(raw.filament_colour)
    ? raw.filament_colour.filter((c) => typeof c === "string" && c.startsWith("#"))
    : [];
  const types = [];
  const seen = new Set();
  const presets = raw.filament_settings_id;
  const list = Array.isArray(presets) ? presets : presets ? [presets] : [];
  list.forEach((preset) => {
    const name = String(preset || "")
      .replace(/@.*$/, "")
      .replace(/^Bambu\s+/i, "")
      .trim();
    const key = name.toUpperCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    types.push(name);
  });
  const nozzleRaw = raw.nozzle_diameter;
  const nozzle = Array.isArray(nozzleRaw) ? nozzleRaw[0] : nozzleRaw;
  const infillRaw = raw.sparse_infill_density;
  let infill = null;
  if (infillRaw != null) {
    const n = parseFloat(String(infillRaw).replace("%", ""));
    if (!Number.isNaN(n)) infill = n;
  }
  const layer = parseFloat(raw.layer_height);
  return {
    filament_colours: colours,
    filament_types: types,
    layer_height: Number.isFinite(layer) ? layer : null,
    nozzle_size: nozzle != null && Number.isFinite(parseFloat(nozzle)) ? parseFloat(nozzle) : null,
    infill,
  };
}

export async function peek3mfPrintProfile(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".3mf")) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocdOffset(bytes);
  if (eocd < 0) return null;

  const entryCount = readU16(view, eocd + 10);
  let cdOffset = readU32(view, eocd + 16);
  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(view, cdOffset) !== 0x02014b50) break;
    const method = readU16(view, cdOffset + 10);
    const compSize = readU32(view, cdOffset + 20);
    const nameLen = readU16(view, cdOffset + 28);
    const extraLen = readU16(view, cdOffset + 30);
    const commentLen = readU16(view, cdOffset + 32);
    const localHeader = readU32(view, cdOffset + 42);
    const name = decodeName(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (!isProjectSettingsName(name)) continue;

    const localNameLen = readU16(view, localHeader + 26);
    const localExtraLen = readU16(view, localHeader + 28);
    const dataStart = localHeader + 30 + localNameLen + localExtraLen;
    const payload = bytes.subarray(dataStart, dataStart + compSize);
    let textBytes = payload;
    if (method === 8) {
      textBytes = await inflateRaw(payload);
    } else if (method !== 0) {
      return null;
    }
    const text = new TextDecoder("utf-8").decode(textBytes);
    return parse3mfProjectSettingsJson(text);
  }
  return null;
}
