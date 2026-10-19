#!/usr/bin/env bash
# x-post-mcp.sh — Call the mcp-social x_post tool from CLI.
# Usage: x-post-mcp.sh --en "text" [--es "text"] [--media "url"]
# Exits 0 on success, 1 on failure. Prints tweet URL on success.
set -euo pipefail

TEXT_EN=""
TEXT_ES=""
MEDIA_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --en)    TEXT_EN="$2";    shift 2 ;;
    --es)    TEXT_ES="$2";    shift 2 ;;
    --media) MEDIA_URL="$2";  shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TEXT_EN" && -z "$TEXT_ES" ]]; then
  echo "Error: at least --en or --es required" >&2
  exit 1
fi

TOKEN=$(cat /root/.santino-social-mcp-token)
ENDPOINT="https://pnptv.app/mcp-santino/social"

# Build arguments JSON
ARGS="{}"
if [[ -n "$TEXT_EN" ]]; then
  ARGS=$(echo "$ARGS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d['text_en'] = '''$TEXT_EN'''
print(json.dumps(d))
")
fi
if [[ -n "$TEXT_ES" ]]; then
  ARGS=$(echo "$ARGS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d['text_es'] = '''$TEXT_ES'''
print(json.dumps(d))
")
fi
if [[ -n "$MEDIA_URL" ]]; then
  ARGS=$(echo "$ARGS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d['media_url'] = '''$MEDIA_URL'''
print(json.dumps(d))
")
fi

PAYLOAD=$(python3 -c "
import json
args = json.loads('''$ARGS''')
body = {
  'jsonrpc': '2.0',
  'id': 1,
  'method': 'tools/call',
  'params': {'name': 'x_post', 'arguments': args}
}
print(json.dumps(body))
")

export RESPONSE
RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD")

# Parse result
python3 - <<'PYEOF'
import json, sys, os

resp = json.loads(os.environ.get('RESPONSE', '{}'))
if 'error' in resp:
    print(f"MCP error: {resp['error']}", file=sys.stderr)
    sys.exit(1)

content = resp.get('result', {}).get('content', [{}])[0].get('text', '{}')
try:
    data = json.loads(content)
except Exception:
    data = {'raw': content}

results = data.get('results', [data])
ok = False
for r in results:
    if r.get('ok'):
        print(f"Posted ({r.get('lang','?')}): {r.get('url','')}")
        ok = True
    elif r.get('skipped'):
        print(f"Skipped ({r.get('lang','?')}): {r.get('issues', [])}")
    elif r.get('error'):
        print(f"Error ({r.get('lang','?')}): {r.get('error')}", file=sys.stderr)

sys.exit(0 if ok else 1)
PYEOF
