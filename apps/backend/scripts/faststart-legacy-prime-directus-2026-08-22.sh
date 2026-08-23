#!/usr/bin/env bash
# Faststart-remux the 30 legacy Prime Directus MP4s in place.
# - moov atom moved to front (browser can decode without downloading whole file)
# - stream copy (no re-encode) except for VVC file which needs H.264 transcode
# - atomic replace (mv over original)
set -uo pipefail
UPLOADS=/opt/pnptvapp/infrastructure/data/directus/uploads
TMPDIR=/tmp/faststart-work
mkdir -p "$TMPDIR"

declare -A SEEN
OK=0; FAIL=0; SKIP=0; TRANSCODE=0

while IFS='|' read -r row_id fid; do
  src="$UPLOADS/$fid.mp4"
  if [[ -n "${SEEN[$fid]:-}" ]]; then
    echo "  row=$row_id file=$fid  → SKIP (already processed)"
    ((SKIP++)); continue
  fi
  SEEN[$fid]=1
  if [[ ! -f "$src" ]]; then
    echo "  row=$row_id file=$fid  → FAIL (missing on disk)"
    ((FAIL++)); continue
  fi

  # Is moov already at front?
  head_bytes=$(head -c 524288 "$src" | LANG=C grep -abo 'moov' | head -1)
  if [[ -n "$head_bytes" ]]; then
    echo "  row=$row_id file=$fid  → SKIP (moov already at front)"
    ((SKIP++)); continue
  fi

  # Codec probe — VVC = re-encode, everything else = stream copy
  codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$src" 2>/dev/null | head -1)
  tmp="$TMPDIR/$fid.tmp.mp4"
  rm -f "$tmp"

  if [[ "$codec" == "vvc" || "$codec" == "hevc" ]]; then
    echo "  row=$row_id file=$fid  codec=$codec  → transcoding to H.264 (this is slow)"
    ffmpeg -nostdin -y -v error -i "$src" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart "$tmp" 2>&1 | tail -3
    ((TRANSCODE++))
  else
    echo "  row=$row_id file=$fid  codec=$codec  size=$(stat -c%s "$src")  → stream-copy remux"
    ffmpeg -nostdin -y -v error -i "$src" -c copy -movflags +faststart "$tmp" 2>&1 | tail -3
  fi

  if [[ ! -s "$tmp" ]]; then
    echo "     ffmpeg failed, no output"
    ((FAIL++)); continue
  fi

  # Verify moov is at start of new file
  verify=$(head -c 524288 "$tmp" | LANG=C grep -abo 'moov' | head -1)
  if [[ -z "$verify" ]]; then
    echo "     moov still not at front — leaving original in place"
    rm -f "$tmp"
    ((FAIL++)); continue
  fi

  # Atomic replace (same filesystem)
  mv "$tmp" "$src"
  chown ubuntu:ubuntu "$src" 2>/dev/null || true
  echo "     ✓ ok  new size=$(stat -c%s "$src")"
  ((OK++))
done < /tmp/prime-legacy-map.txt

echo ""
echo "=== SUMMARY: ok=$OK  skip=$SKIP  fail=$FAIL  transcoded=$TRANSCODE ==="
