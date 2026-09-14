/**
 * Czyta Metadata/project_settings.config z .3MF (ZIP) w przeglądarce,
 * bez czekania na /api/analyze-model. Dzięki temu AMS i parametry
 * pojawiają się od razu, nawet gdy geometria Jaguara jeszcze się liczy.
 */

import {
  parse3mfSliceInfoXml,
  canQuoteFromPeekedSliceInfo,
  MIN_BAMBU_SLICE_WEIGHT_G,
  MIN_3MF_MESH_PAYLOAD_BYTES,
} from "./peek3mfSliceInfo.cjs";

export {
  parse3mfSliceInfoXml,
  canQuoteFromPeekedSliceInfo,
  MIN_BAMBU_SLICE_WEIGHT_G,
  MIN_3MF_MESH_PAYLOAD_BYTES,
};

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

function isSliceInfoName(name) {
  const lower = String(name || "").replace(/\\/g, "/").toLowerCase();
  return lower.endsWith("metadata/slice_info.config") || lower.endsWith("/slice_info.config");
}

function isModelEntryName(name) {
  return String(name || "").toLowerCase().endsWith(".model");
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

export async function peek3mfPrintProfileFromBytes(bytes) {
  if (!bytes || !bytes.length) return null;
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

export async function peek3mfPrintProfile(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".3mf")) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return peek3mfPrintProfileFromBytes(bytes);
}

const MIN_PREVIEW_BYTES = 2048;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function headerStartsWith(bytes, magic) {
  if (!bytes || bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

function previewCandidateScore(name) {
  const n = String(name || "").replace(/\\/g, "/").replace(/^\//, "").toLowerCase();
  if (!n || n.endsWith("/")) return -1;
  if (n.startsWith("auxiliaries/templates/")) return -1;
  if (n.endsWith(".svg")) return -1;
  if (n.startsWith("metadata/plate_") && n.endsWith(".png")) {
    return n.includes("_small") ? 80 : 100;
  }
  if (n.includes("thumbnail_3mf") && /\.(png|jpe?g|webp)$/.test(n)) return 70;
  if (n.startsWith("metadata/") && /\.(png|jpe?g|webp)$/.test(n)) return 60;
  if ((n.includes("thumbnail") || n.startsWith("thumbnails/")) && /\.(png|jpe?g|webp)$/.test(n)) {
    return 50;
  }
  if (/\.(png|jpe?g|webp)$/.test(n)) return 10;
  return -1;
}

function previewMimeFromBytes(name, bytes) {
  const lower = String(name || "").toLowerCase();
  if (headerStartsWith(bytes, PNG_MAGIC)) return "image/png";
  if (headerStartsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  if (
    lower.endsWith(".webp") &&
    bytes &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  return null;
}

async function readZipEntryBytes(bytes, view, cdOffset) {
  const method = readU16(view, cdOffset + 10);
  const compSize = readU32(view, cdOffset + 20);
  const nameLen = readU16(view, cdOffset + 28);
  const extraLen = readU16(view, cdOffset + 30);
  const commentLen = readU16(view, cdOffset + 32);
  const localHeader = readU32(view, cdOffset + 42);
  const name = decodeName(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
  const localNameLen = readU16(view, localHeader + 26);
  const localExtraLen = readU16(view, localHeader + 28);
  const dataStart = localHeader + 30 + localNameLen + localExtraLen;
  const payload = bytes.subarray(dataStart, dataStart + compSize);
  let out = payload;
  if (method === 8) {
    out = await inflateRaw(payload);
  } else if (method !== 0) {
    return { name, data: null, nextCd: cdOffset + 46 + nameLen + extraLen + commentLen };
  }
  return { name, data: out, nextCd: cdOffset + 46 + nameLen + extraLen + commentLen };
}

/**
 * Miniatura z 3MF (Metadata/plate_1.png / OPC thumbnail) jako blob URL.
 * Działa od razu w przeglądarce, jeszcze zanim wróci /api/analyze-model.
 */
export async function peek3mfPreviewImageFromBytes(bytes) {
  if (!bytes || !bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocdOffset(bytes);
  if (eocd < 0) return null;

  const entryCount = readU16(view, eocd + 10);
  let cdOffset = readU32(view, eocd + 16);
  const ranked = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(view, cdOffset) !== 0x02014b50) break;
    const uncompSize = readU32(view, cdOffset + 24);
    const nameLen = readU16(view, cdOffset + 28);
    const extraLen = readU16(view, cdOffset + 30);
    const commentLen = readU16(view, cdOffset + 32);
    const name = decodeName(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    const score = previewCandidateScore(name);
    if (score >= 0 && uncompSize >= MIN_PREVIEW_BYTES) {
      ranked.push({ score, uncompSize, cdOffset, name });
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  ranked.sort((a, b) => b.score - a.score || b.uncompSize - a.uncompSize);
  for (const cand of ranked) {
    try {
      const entry = await readZipEntryBytes(bytes, view, cand.cdOffset);
      if (!entry.data || entry.data.length < MIN_PREVIEW_BYTES) continue;
      const mime = previewMimeFromBytes(entry.name, entry.data);
      if (!mime) continue;
      const blob = new Blob([entry.data], { type: mime });
      return {
        url: URL.createObjectURL(blob),
        source: String(entry.name || "").replace(/\\/g, "/").replace(/^\//, ""),
      };
    } catch (err) {
      console.warn("Nie udało się odczytać miniatury 3MF:", err);
    }
  }
  return null;
}

export async function peek3mfPreviewImage(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".3mf")) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return peek3mfPreviewImageFromBytes(bytes);
}

export async function peek3mfSlicePayloadFromBytes(bytes) {
  if (!bytes || !bytes.length) {
    return { sliceStats: null, maxModelUncompressed: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocdOffset(bytes);
  if (eocd < 0) return { sliceStats: null, maxModelUncompressed: 0 };

  const entryCount = readU16(view, eocd + 10);
  let cdOffset = readU32(view, eocd + 16);
  let maxModelUncompressed = 0;
  let sliceCd = -1;
  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(view, cdOffset) !== 0x02014b50) break;
    const uncompSize = readU32(view, cdOffset + 24);
    const nameLen = readU16(view, cdOffset + 28);
    const extraLen = readU16(view, cdOffset + 30);
    const commentLen = readU16(view, cdOffset + 32);
    const name = decodeName(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    if (isModelEntryName(name) && uncompSize > maxModelUncompressed) {
      maxModelUncompressed = uncompSize;
    }
    if (isSliceInfoName(name)) sliceCd = cdOffset;
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  let sliceStats = null;
  if (sliceCd >= 0) {
    try {
      const entry = await readZipEntryBytes(bytes, view, sliceCd);
      if (entry.data && entry.data.length) {
        sliceStats = parse3mfSliceInfoXml(new TextDecoder("utf-8").decode(entry.data));
      }
    } catch (err) {
      console.warn("Nie udało się odczytać slice_info z 3MF:", err);
    }
  }
  return { sliceStats, maxModelUncompressed };
}

export async function peek3mfSidecar(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".3mf")) {
    return { profile: null, preview: null, sliceStats: null, maxModelUncompressed: 0 };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const profile = await peek3mfPrintProfileFromBytes(bytes);
  const preview = await peek3mfPreviewImageFromBytes(bytes);
  const payload = await peek3mfSlicePayloadFromBytes(bytes);
  return { profile, preview, ...payload };
}
