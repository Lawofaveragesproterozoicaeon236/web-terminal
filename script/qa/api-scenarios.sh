#!/usr/bin/env bash
# Real-surface QA: C5 auth, C6 files roundtrip, C7 herdr snapshot — curl + sha256 evidence.
set -uo pipefail
BASE="${1:-http://127.0.0.1:7799}"
PASSWORD="${2:-qa-password-123}"
EVIDENCE="${3:-qa-evidence}"
mkdir -p "$EVIDENCE"
fails=0
say() { echo "[$1] $2"; }

# ---- C5 auth ----
{
  wrong=$(curl -si -X POST "$BASE/api/login" -H 'content-type: application/json' -d '{"password":"wrong-pass"}' | tee "$EVIDENCE/c5-wrong-password.txt" | head -1)
  case "$wrong" in *401*) say PASS "C5a wrong password -> 401";; *) say FAIL "C5a expected 401, got: $wrong"; fails=$((fails+1));; esac

  for i in 2 3 4 5; do curl -so /dev/null -X POST "$BASE/api/login" -H 'content-type: application/json' -d '{"password":"wrong-pass"}'; done
  limited=$(curl -si -X POST "$BASE/api/login" -H 'content-type: application/json' -d '{"password":"wrong-pass"}' | tee "$EVIDENCE/c5-rate-limited.txt" | head -1)
  case "$limited" in *429*) say PASS "C5b 6th rapid failure -> 429";; *) say FAIL "C5b expected 429, got: $limited"; fails=$((fails+1));; esac

  ws=$(curl -si "$BASE/ws" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' | tee "$EVIDENCE/c5-ws-noauth.txt" | head -1)
  case "$ws" in *401*) say PASS "C5c WS upgrade without session -> 401";; *) say FAIL "C5c expected 401, got: $ws"; fails=$((fails+1));; esac
}

# login from a clean IP context happens against localhost after window reset is impractical; use correct password from another path:
JAR=$(mktemp)
sleep 1
login_status=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST "$BASE/api/login" -H 'content-type: application/json' -H 'X-Forwarded-For: 10.99.0.7' -d "{\"password\":\"$PASSWORD\"}")
if [ "$login_status" = "200" ]; then say PASS "C5d correct password (fresh ip) -> 200 + cookie"; else say FAIL "C5d login failed: $login_status"; fails=$((fails+1)); fi

# ---- C6 files ----
{
  payload=$(mktemp); head -c 65536 /dev/urandom > "$payload"
  up=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PUT "$BASE/api/files/content?path=qa-upload.bin" --data-binary @"$payload")
  down=$(mktemp)
  curl -s -b "$JAR" "$BASE/api/files/content?path=qa-upload.bin&download=1" -o "$down" -D "$EVIDENCE/c6-download-headers.txt"
  h1=$(shasum -a 256 "$payload" | cut -d' ' -f1); h2=$(shasum -a 256 "$down" | cut -d' ' -f1)
  echo "upload_status=$up sha_up=$h1 sha_down=$h2" > "$EVIDENCE/c6-hashes.txt"
  if [ "$up" = "200" ] && [ "$h1" = "$h2" ]; then say PASS "C6a upload/download byte-identical (sha256 $h1)"; else say FAIL "C6a hash mismatch"; fails=$((fails+1)); fi

  edit_body="edited-by-qa-$(date +%s)"
  curl -s -o /dev/null -b "$JAR" -X PUT "$BASE/api/files/content?path=qa-edit.txt" --data-binary "$edit_body"
  ondisk=$(cat "$WT_FILES_ROOT/qa-edit.txt" 2>/dev/null || echo MISSING)
  echo "expected=$edit_body ondisk=$ondisk" >> "$EVIDENCE/c6-hashes.txt"
  if [ "$ondisk" = "$edit_body" ]; then say PASS "C6b edit persisted to disk"; else say FAIL "C6b edit not on disk: $ondisk"; fails=$((fails+1)); fi

  trav=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/api/files/content?path=../../etc/passwd")
  if [ "$trav" = "403" ]; then say PASS "C6c traversal rejected -> 403"; else say FAIL "C6c expected 403, got $trav"; fails=$((fails+1)); fi
  rm -f "$payload" "$down"
}

# ---- C7 herdr ----
{
  snap=$(curl -s -b "$JAR" "$BASE/api/herdr/snapshot" | tee "$EVIDENCE/c7-herdr-snapshot.json")
  case "$snap" in *'"status":"connected"'*workspaces*) say PASS "C7 herdr snapshot connected with workspaces";; *) say FAIL "C7 snapshot: $snap"; fails=$((fails+1));; esac
}

rm -f "$JAR"
echo; echo "$((7-fails))/7 API scenarios passed"
exit $fails
