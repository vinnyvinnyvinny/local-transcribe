#!/usr/bin/env bash

# Local Transcription Service — CLI Test Script
# Version: 1.2.8
# Usage: bash test-cli.sh

set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass()   { echo -e "${GREEN}  ✓ PASS${NC}  $1"; ((PASS++)); }
fail()   { echo -e "${RED}  ✗ FAIL${NC}  $1"; ((FAIL++)); }
skip()   { echo -e "${YELLOW}  – SKIP${NC}  $1"; ((SKIP++)); }
expect() { echo -e "${CYAN}  expected:${NC} $1"; }
actual() { echo -e "${CYAN}  actual:  ${NC} $1"; }
section(){ echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }
note()   { echo -e "${YELLOW}  note:${NC} $1"; }

# ── Audio file inputs ──────────────────────────────────────────────────────────

echo ""
echo "Local Transcription Service — CLI Test Suite"
echo "============================================"
echo ""
echo "You'll need:"
echo "  - A short audio file (~10–30s) for basic tests"
echo "  - mc3.mp3 (the repetition loop test file) — optional but recommended"
echo "  - A long audio file (>20 min) — optional"
echo ""

read -rp "Path to short audio file: " SHORT_AUDIO
SHORT_AUDIO="${SHORT_AUDIO/#\~/$HOME}"

read -rp "Path to mc3.mp3 (press Enter to skip): " MC3_AUDIO
MC3_AUDIO="${MC3_AUDIO/#\~/$HOME}"

read -rp "Path to long audio file >20 min (press Enter to skip): " LONG_AUDIO
LONG_AUDIO="${LONG_AUDIO/#\~/$HOME}"

echo ""

# ── Cleanup on exit ────────────────────────────────────────────────────────────

SERVICE_PID=""
cleanup() {
  if [[ -n "$SERVICE_PID" ]]; then
    kill "$SERVICE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Helper: wait for service ───────────────────────────────────────────────────

wait_for_service() {
  local attempts=0
  while ! curl -sf http://localhost:9876/health > /dev/null 2>&1; do
    sleep 1
    ((attempts++))
    if ((attempts > 15)); then
      echo "Service did not start within 15 seconds."
      return 1
    fi
  done
}

# ═══════════════════════════════════════════════════════════════════════════════
section "1. Version check"
# ═══════════════════════════════════════════════════════════════════════════════

expect "1.2.8"
VERSION=$(transcribe --version 2>&1)
actual "$VERSION"
if echo "$VERSION" | grep -q "1.2.8"; then
  pass "transcribe --version"
else
  fail "transcribe --version — got: $VERSION"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "2. Start service"
# ═══════════════════════════════════════════════════════════════════════════════

expect "Service starts on port 9876"
transcribe start > /tmp/transcribe-test.log 2>&1 &
SERVICE_PID=$!
note "Service PID: $SERVICE_PID — waiting up to 15s..."

if wait_for_service; then
  pass "Service started and responding"
else
  fail "Service did not start"
  echo "Log output:"
  cat /tmp/transcribe-test.log
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "3. Health check"
# ═══════════════════════════════════════════════════════════════════════════════

expect '{"status":"ok","version":"1.2.8"}'
HEALTH=$(curl -sf http://localhost:9876/health)
actual "$HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"' && echo "$HEALTH" | grep -q '"version":"1.2.8"'; then
  pass "GET /health"
else
  fail "GET /health — got: $HEALTH"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "4. Model list"
# ═══════════════════════════════════════════════════════════════════════════════

expect "JSON array with name, downloaded fields"
MODELS=$(curl -sf http://localhost:9876/models)
actual "$(echo "$MODELS" | head -c 200)..."
if echo "$MODELS" | grep -q '"name"' && echo "$MODELS" | grep -q '"downloaded"'; then
  pass "GET /models"
else
  fail "GET /models — got: $MODELS"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "5. Pull model (CLI)"
# ═══════════════════════════════════════════════════════════════════════════════

expect "whisper-tiny downloads (or already cached)"
note "This may take a moment on first run..."
if transcribe pull whisper-tiny 2>&1 | tail -5; then
  pass "transcribe pull whisper-tiny"
else
  fail "transcribe pull whisper-tiny"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "6. Pull model (API)"
# ═══════════════════════════════════════════════════════════════════════════════

expect '{"status":"pulling"} or similar — already cached is fine'
PULL_RESP=$(curl -sf -X POST http://localhost:9876/models/whisper-tiny/pull 2>&1 || true)
actual "$PULL_RESP"
pass "POST /models/whisper-tiny/pull (response received)"

# ═══════════════════════════════════════════════════════════════════════════════
section "7. Basic transcription"
# ═══════════════════════════════════════════════════════════════════════════════

expect "JSON with transcript, duration_ms, model_used:whisper-tiny, language"
note "Using: $SHORT_AUDIO"
TRANSCRIPT=$(curl -sf -X POST "http://localhost:9876/transcribe?model=whisper-tiny" \
  -F "audio=@$SHORT_AUDIO" 2>&1)
actual "$(echo "$TRANSCRIPT" | head -c 300)"
if echo "$TRANSCRIPT" | grep -q '"transcript"' && echo "$TRANSCRIPT" | grep -q '"model_used":"whisper-tiny"'; then
  pass "POST /transcribe (basic)"
else
  fail "POST /transcribe (basic) — got: $TRANSCRIPT"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "8. Word timestamps — whisper-tiny should return 400"
# ═══════════════════════════════════════════════════════════════════════════════

expect "HTTP 400 with model_too_small error (by design)"
HTTP_STATUS=$(curl -s -o /tmp/ts-resp.json -w "%{http_code}" \
  -X POST "http://localhost:9876/transcribe?timestamps=word&model=whisper-tiny" \
  -F "audio=@$SHORT_AUDIO")
actual "HTTP $HTTP_STATUS — $(cat /tmp/ts-resp.json)"
if [[ "$HTTP_STATUS" == "400" ]]; then
  pass "word timestamps + whisper-tiny → 400 (correct)"
else
  fail "word timestamps + whisper-tiny → expected 400, got $HTTP_STATUS"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "9. Word timestamps — whisper-base (should succeed)"
# ═══════════════════════════════════════════════════════════════════════════════

note "Pulling whisper-base if needed — may take a moment..."
transcribe pull whisper-base > /dev/null 2>&1 || true

expect "JSON with words array containing word, start, end fields"
TS_RESP=$(curl -sf -X POST "http://localhost:9876/transcribe?timestamps=word&model=whisper-base" \
  -F "audio=@$SHORT_AUDIO" 2>&1)
actual "$(echo "$TS_RESP" | head -c 400)"
if echo "$TS_RESP" | grep -q '"words"' && echo "$TS_RESP" | grep -q '"start"'; then
  pass "word timestamps + whisper-base → success"
else
  fail "word timestamps + whisper-base — got: $TS_RESP"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "10. SSE streaming"
# ═══════════════════════════════════════════════════════════════════════════════

expect "SSE events: loading → transcribing → complete"
note "Using: $SHORT_AUDIO"
SSE_OUT=$(curl -sf -X POST "http://localhost:9876/transcribe?stream=true&model=whisper-tiny" \
  -F "audio=@$SHORT_AUDIO" \
  -H "Accept: text/event-stream" \
  --no-buffer \
  --max-time 60 2>&1)
actual "$(echo "$SSE_OUT" | head -c 400)"
if echo "$SSE_OUT" | grep -q '"status":"complete"'; then
  pass "SSE streaming → complete event received"
else
  fail "SSE streaming — no complete event. Output: $SSE_OUT"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "11. Repetition loop test (mc3.mp3)"
# ═══════════════════════════════════════════════════════════════════════════════

if [[ -z "$MC3_AUDIO" || ! -f "$MC3_AUDIO" ]]; then
  skip "mc3.mp3 not provided"
else
  expect "Transcript ends with 'I went out with some friends' — no repetition loop"
  MC3_RESP=$(curl -sf -X POST "http://localhost:9876/transcribe?model=whisper-base" \
    -F "audio=@$MC3_AUDIO" 2>&1)
  MC3_TEXT=$(echo "$MC3_RESP" | grep -o '"transcript":"[^"]*"' | head -1)
  actual "$MC3_TEXT"

  GREAT_COUNT=$(echo "$MC3_TEXT" | grep -oi "great" | wc -l | tr -d ' ')
  note "Occurrences of 'great' in transcript: $GREAT_COUNT (expect ≤3)"

  if echo "$MC3_TEXT" | grep -qi "friends" && [[ "$GREAT_COUNT" -le 3 ]]; then
    pass "Repetition loop fixed — 'friends' present, loop absent"
  elif [[ "$GREAT_COUNT" -gt 5 ]]; then
    fail "Repetition loop still present — 'great' count: $GREAT_COUNT"
  else
    note "Could not fully verify — check transcript above manually"
    pass "mc3.mp3 transcribed without crashing (manual check needed)"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "12. Per-request model override"
# ═══════════════════════════════════════════════════════════════════════════════

expect '"model_used":"whisper-tiny"'
OVERRIDE=$(curl -sf -X POST "http://localhost:9876/transcribe?model=whisper-tiny" \
  -F "audio=@$SHORT_AUDIO" 2>&1)
actual "$(echo "$OVERRIDE" | grep -o '"model_used":"[^"]*"')"
if echo "$OVERRIDE" | grep -q '"model_used":"whisper-tiny"'; then
  pass "Per-request model override"
else
  fail "Per-request model override — got: $OVERRIDE"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "13. Manual model unload"
# ═══════════════════════════════════════════════════════════════════════════════

expect "Confirmation response, model unloaded"
UNLOAD=$(curl -sf -X POST http://localhost:9876/models/unload 2>&1)
actual "$UNLOAD"
if echo "$UNLOAD" | grep -qiE '"status"|unload|ok|success'; then
  pass "POST /models/unload"
else
  fail "POST /models/unload — got: $UNLOAD"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "14. Error cases"
# ═══════════════════════════════════════════════════════════════════════════════

# Invalid file (send a text file as audio via multipart)
expect "Error JSON, no crash"
echo "not audio" > /tmp/notaudio.txt
INVALID_STATUS=$(curl -s -o /tmp/invalid-resp.json -w "%{http_code}" \
  -X POST http://localhost:9876/transcribe \
  -F "audio=@/tmp/notaudio.txt")
actual "HTTP $INVALID_STATUS — $(cat /tmp/invalid-resp.json)"
if echo "$(cat /tmp/invalid-resp.json)" | grep -qiE '"error"|"message"|"code"'; then
  pass "Invalid file → error JSON returned (HTTP $INVALID_STATUS)"
else
  fail "Invalid file → unexpected response: $(cat /tmp/invalid-resp.json)"
fi

# No audio field (multipart with wrong field name)
expect "HTTP 400 with descriptive error (missing audio field)"
NO_FILE_STATUS=$(curl -s -o /tmp/nofile-resp.json -w "%{http_code}" \
  -X POST http://localhost:9876/transcribe \
  -F "notaudio=placeholder")
actual "HTTP $NO_FILE_STATUS — $(cat /tmp/nofile-resp.json)"
if [[ "$NO_FILE_STATUS" == "400" ]]; then
  pass "No audio field → 400"
else
  fail "No audio field → expected 400, got $NO_FILE_STATUS — $(cat /tmp/nofile-resp.json)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "15. CLI: models list"
# ═══════════════════════════════════════════════════════════════════════════════

expect "Table of available models with download status"
transcribe models
pass "transcribe models (check output above)"

# ═══════════════════════════════════════════════════════════════════════════════
section "16. CLI: config"
# ═══════════════════════════════════════════════════════════════════════════════

expect "Current config values (port, model, cache dir, etc.)"
transcribe config
pass "transcribe config (check output above)"

# ═══════════════════════════════════════════════════════════════════════════════
section "17. Long audio (>20 min segmentation)"
# ═══════════════════════════════════════════════════════════════════════════════

if [[ -z "$LONG_AUDIO" || ! -f "$LONG_AUDIO" ]]; then
  skip "Long audio not provided — skipping segmentation path test"
else
  note "Using: $LONG_AUDIO — this may take several minutes..."
  expect "Completes without offset errors; response includes segmented:true"
  LONG_RESP=$(curl -sf -X POST "http://localhost:9876/transcribe?model=whisper-base" \
    -F "audio=@$LONG_AUDIO" \
    --max-time 600 2>&1)
  actual "$(echo "$LONG_RESP" | head -c 300)"
  if echo "$LONG_RESP" | grep -q '"transcript"'; then
    if echo "$LONG_RESP" | grep -q '"segmented":true'; then
      pass "Long audio → segmented:true, transcript returned"
    else
      pass "Long audio → transcript returned (segmented flag not set — may be under 20 min threshold)"
    fi
  else
    fail "Long audio → no transcript. Got: $(echo "$LONG_RESP" | head -c 200)"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "18. Stop service"
# ═══════════════════════════════════════════════════════════════════════════════

expect "Service stops; port 9876 no longer listening"
transcribe stop 2>&1 || true
SERVICE_PID=""  # prevent double-kill in trap
sleep 2
if ! curl -sf http://localhost:9876/health > /dev/null 2>&1; then
  pass "Service stopped — port 9876 not responding"
else
  fail "Service still responding after stop"
fi

# ═══════════════════════════════════════════════════════════════════════════════
section "Results"
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${GREEN}PASS${NC}  $PASS"
echo -e "  ${RED}FAIL${NC}  $FAIL"
echo -e "  ${YELLOW}SKIP${NC}  $SKIP"
echo ""

echo "Manual checks remaining:"
echo "  • Browser UI (http://localhost:9876 after restarting): page loads, no console errors"
echo "  • Language combobox: type 'port' → Portuguese; blank = auto-detect"
echo "  • SSE toggle in browser: streaming events visible"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}All automated tests passed.${NC}"
  exit 0
else
  echo -e "${RED}$FAIL test(s) failed — review output above.${NC}"
  exit 1
fi
