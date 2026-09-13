#!/usr/bin/env bash
# Re-encode the homepage printer hero for scroll-scrub.
#
# Seeking to a non-keyframe forces the decoder to walk from the last I-frame,
# which is what makes the hero hitch. This script:
#   - slows motion to ~0.6× so a viewport of scroll covers more timestamps
#   - outputs 30 fps (duplicated frames compress; unique blends do not)
#   - uses a 3-frame GOP and no B-frames (all-intra / GOP 1–2 is huge)
#   - keeps 1280-wide, muted, yuv420p (browser-safe)
#   - writes a mid-clip poster
#
# Usage:
#   ./frontend/scripts/encode-printer-hero.sh [source.mp4]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Pass the original (not already slowed) clip. Re-running against the output
# would stack the 0.6× setpts filter.
SRC="${1:-$ROOT/public/videos/printer-layers-loop.mp4}"
OUT_DIR="$ROOT/public/videos"
TMP_DIR="${TMPDIR:-/tmp}/printer-hero-encode-$$"
SPEED="${PRINTER_HERO_SPEED:-0.6}"
WIDTH="${PRINTER_HERO_WIDTH:-1280}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required. Install it, then re-run this script." >&2
  exit 1
fi

mkdir -p "$TMP_DIR"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

VF="setpts=PTS/${SPEED},fps=30,scale=${WIDTH}:-2:flags=lanczos"

# GOP 3 + no B-frames: at most two frames to decode on seek; I-frames stay cheap.
echo "Encoding H.264 (GOP 3, no B-frames)…"
ffmpeg -y -i "$SRC" -an \
  -vf "$VF" \
  -c:v libx264 -preset medium -crf 28 \
  -pix_fmt yuv420p -profile:v high \
  -g 3 -keyint_min 3 -bf 0 -sc_threshold 0 \
  -movflags +faststart \
  -map_metadata -1 \
  "$TMP_DIR/printer-layers-loop.mp4"

echo "Encoding VP9 (GOP 3, 8-bit 4:2:0)…"
ffmpeg -y -i "$SRC" -an \
  -vf "$VF" \
  -c:v libvpx-vp9 -b:v 0 -crf 42 -cpu-used 4 -row-mt 1 \
  -pix_fmt yuv420p \
  -g 3 -keyint_min 3 -auto-alt-ref 0 \
  -map_metadata -1 \
  "$TMP_DIR/printer-layers-loop.webm"

DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP_DIR/printer-layers-loop.mp4")"
MID="$(awk -v d="$DURATION" 'BEGIN { printf "%.3f", d / 2 }')"

echo "Poster from ${MID}s…"
ffmpeg -y -ss "$MID" -i "$TMP_DIR/printer-layers-loop.mp4" -frames:v 1 -q:v 3 \
  "$TMP_DIR/printer-layers-poster.jpg"

cp "$TMP_DIR/printer-layers-loop.mp4" "$OUT_DIR/printer-layers-loop.mp4"
cp "$TMP_DIR/printer-layers-loop.webm" "$OUT_DIR/printer-layers-loop.webm"
cp "$TMP_DIR/printer-layers-poster.jpg" "$OUT_DIR/printer-layers-poster.jpg"

echo "Wrote:"
ls -lh "$OUT_DIR/printer-layers-loop.mp4" "$OUT_DIR/printer-layers-loop.webm" "$OUT_DIR/printer-layers-poster.jpg"
ffprobe -hide_banner -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,nb_frames -show_entries format=duration,size -of default=noprint_wrappers=1 \
  "$OUT_DIR/printer-layers-loop.mp4"
