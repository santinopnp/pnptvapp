#!/usr/bin/env bash
#
# Prepend a rendered intro to a source video.
#
#   render/prepend-intro.sh SOURCE_VIDEO INTRO_VIDEO OUTPUT
#
# This is the last step of the upload flow: render the intro with the upload's
# metadata, then join it to the uploaded file. It re-encodes rather than using
# the concat demuxer on purpose — an intro and an arbitrary upload almost never
# share codec, resolution, framerate, pixel format and audio layout, and the
# stream-copy path silently produces broken output when they differ.
#
# The intro is scaled and padded to the source's exact frame, and a silent audio
# track is synthesised for it so the concat filter has matching stream counts.
#
# Requires a full ffmpeg (H.264 + AAC). Playwright's bundled ffmpeg will not do.

set -euo pipefail

if [ "$#" -ne 3 ]; then
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

SOURCE="$1"
INTRO="$2"
OUTPUT="$3"

for f in "$SOURCE" "$INTRO"; do
  [ -f "$f" ] || { echo "not found: $f" >&2; exit 1; }
done

command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH" >&2; exit 1; }

# Match the source's frame and rate so the join is seamless.
read -r WIDTH HEIGHT <<EOF
$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0:s=' ' "$SOURCE")
EOF

FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
  -of default=nw=1:nk=1 "$SOURCE")"

# Does the source carry audio? Concat needs the same stream count on both sides.
HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index \
  -of csv=p=0 "$SOURCE" | head -1)"

INTRO_DUR="$(ffprobe -v error -show_entries format=duration \
  -of default=nw=1:nk=1 "$INTRO")"

echo "source: ${WIDTH}x${HEIGHT} @ ${FPS}$([ -n "$HAS_AUDIO" ] && echo ' +audio')"
echo "intro:  ${INTRO_DUR}s"

# concat requires identical stream parameters on both sides, so the two audio
# branches are normalised to the same rate, layout AND sample format — not just
# the same rate, which is the easy version of this that fails on some sources.
AFMT="aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000"

SCALE_PAD="scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,\
pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#121212,\
setsar=1,fps=${FPS},format=yuv420p"

if [ -n "$HAS_AUDIO" ]; then
  ffmpeg -y \
    -i "$INTRO" \
    -f lavfi -t "$INTRO_DUR" -i anullsrc=channel_layout=stereo:sample_rate=48000 \
    -i "$SOURCE" \
    -filter_complex "\
[0:v]${SCALE_PAD}[iv]; \
[1:a]${AFMT}[ia]; \
[2:v]${SCALE_PAD}[sv]; \
[2:a]${AFMT}[sa]; \
[iv][ia][sv][sa]concat=n=2:v=1:a=1[v][a]" \
    -map '[v]' -map '[a]' \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "$OUTPUT"
else
  ffmpeg -y \
    -i "$INTRO" \
    -i "$SOURCE" \
    -filter_complex "\
[0:v]${SCALE_PAD}[iv]; \
[1:v]${SCALE_PAD}[sv]; \
[iv][sv]concat=n=2:v=1:a=0[v]" \
    -map '[v]' \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -movflags +faststart \
    "$OUTPUT"
fi

echo "✓ $OUTPUT"
