#!/bin/bash
# Backfill video_thumbnail_url for social_posts that lack one.
# Handles: /uploads/* (local ffmpeg), https://cms.pnptv.app/* (download + ffmpeg),
# other http (download + ffmpeg). Skips ones already thumbnailed.
# Idempotent: skips rows whose thumb file already exists on disk.

set -uo pipefail

UPLOAD_ROOT="/opt/pnptvapp/public/uploads"
THUMB_DIR="${UPLOAD_ROOT}/thumbs"
LOG="/opt/pnptvapp/logs/thumb-backfill.log"
mkdir -p "${THUMB_DIR}"
: > "${LOG}"

fetch_rows() {
  docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -At -F '|' -c "
    SELECT id, COALESCE(media_url, '')
    FROM social_posts
    WHERE is_deleted=false
      AND media_type='video'
      AND (video_thumbnail_url IS NULL OR video_thumbnail_url='')
      AND media_url IS NOT NULL AND media_url != ''
    ORDER BY id;
  "
}

process_one() {
  local id="$1"; local url="$2"
  local out="${THUMB_DIR}/post-${id}.jpg"
  local rel="/uploads/thumbs/post-${id}.jpg"
  local src=""
  local tmp=""

  if [[ -s "${out}" ]]; then
    docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c \
      "UPDATE social_posts SET video_thumbnail_url='${rel}' WHERE id=${id} AND (video_thumbnail_url IS NULL OR video_thumbnail_url='');" >/dev/null 2>&1
    echo "SKIP-EXISTS ${id}" >> "${LOG}"; return 0
  fi

  if [[ "${url}" == /uploads/* ]]; then
    src="${UPLOAD_ROOT}${url#/uploads}"
  elif [[ "${url}" == http* ]]; then
    tmp="/tmp/thumb-src-${id}.bin"
    curl -sSL --max-time 30 -o "${tmp}" "${url}" || { echo "FAIL-DL ${id} ${url}" >> "${LOG}"; return 1; }
    src="${tmp}"
  else
    echo "SKIP-UNKNOWN ${id} ${url}" >> "${LOG}"; return 1
  fi

  if [[ ! -s "${src}" ]]; then
    echo "MISS ${id} ${src}" >> "${LOG}"
    [[ -n "${tmp}" ]] && rm -f "${tmp}"
    return 1
  fi

  ffmpeg -ss 1 -i "${src}" -frames:v 1 -q:v 4 -y "${out}" >/dev/null 2>&1
  local rc=$?
  [[ -n "${tmp}" ]] && rm -f "${tmp}"

  if [[ ${rc} -eq 0 && -s "${out}" ]]; then
    docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c \
      "UPDATE social_posts SET video_thumbnail_url='${rel}' WHERE id=${id};" >/dev/null 2>&1
    echo "OK ${id}" >> "${LOG}"
  else
    # Try without -ss (some short clips)
    ffmpeg -i "${src}" -frames:v 1 -q:v 4 -y "${out}" >/dev/null 2>&1
    if [[ -s "${out}" ]]; then
      docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c \
        "UPDATE social_posts SET video_thumbnail_url='${rel}' WHERE id=${id};" >/dev/null 2>&1
      echo "OK-FIRSTFRAME ${id}" >> "${LOG}"
    else
      echo "FAIL-FFMPEG ${id}" >> "${LOG}"
      rm -f "${out}"
    fi
  fi
}

TOTAL=0
OK=0
FAIL=0
while IFS='|' read -r id url; do
  [[ -z "${id}" ]] && continue
  TOTAL=$((TOTAL+1))
  if process_one "${id}" "${url}"; then
    OK=$((OK+1))
  else
    FAIL=$((FAIL+1))
  fi
  if (( TOTAL % 50 == 0 )); then
    echo "progress: ${TOTAL} processed (ok=${OK}, fail=${FAIL})" >> "${LOG}"
  fi
done < <(fetch_rows)

echo "DONE total=${TOTAL} ok=${OK} fail=${FAIL}" >> "${LOG}"
echo "DONE total=${TOTAL} ok=${OK} fail=${FAIL}"
