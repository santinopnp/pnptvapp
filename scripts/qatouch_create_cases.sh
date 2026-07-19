#!/bin/bash
# QAtouch test case creation — Book a Call feature audit
# Usage: TOKEN=<your_api_token> bash qatouch_create_cases.sh
# Requires: curl, jq

set -euo pipefail

BASE="https://easybots.qatouch.com/api/v1"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
TOKEN="${TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Set TOKEN env var first. Example: TOKEN=abc123 bash $0"
  exit 1
fi

api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -X "$method" "$BASE$path"
    -H "api-token: $TOKEN"
    -H "User-Agent: $UA"
    -H "Accept: application/json"
    -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}"
}

echo "=== Discovering project, milestone, section keys ==="

# Get projects
PROJECTS=$(api GET "/project/all")
echo "Projects: $PROJECTS" | head -3
PROJECT_KEY=$(echo "$PROJECTS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('data', data) if isinstance(data, dict) else data
if isinstance(items, list) and items:
    print(items[0].get('key','') or items[0].get('project_key',''))
elif isinstance(items, dict):
    for k,v in items.items():
        if isinstance(v, list) and v:
            print(v[0].get('key','') or v[0].get('project_key',''))
            break
" 2>/dev/null)
echo "Project key: $PROJECT_KEY"

if [[ -z "$PROJECT_KEY" ]]; then
  echo "ERROR: Could not get project key. Check token or project list manually."
  exit 1
fi

# Get milestones
MILESTONES=$(api GET "/milestone/all?project_key=$PROJECT_KEY")
MILESTONE_KEY=$(echo "$MILESTONES" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('data', [])
if items: print(items[0].get('key','') or items[0].get('milestone_key',''))
" 2>/dev/null)
echo "Milestone key: $MILESTONE_KEY"

# Get sections
SECTIONS=$(api GET "/testcase/section?project_key=$PROJECT_KEY")
SECTION_KEY=$(echo "$SECTIONS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('data', [])
if items: print(items[0].get('key','') or items[0].get('section_key',''))
" 2>/dev/null)
echo "Section key: $SECTION_KEY"

# Create test case helper
created=0
failed=0
create_case() {
  local title="$1" desc="$2" status="${3:-new}"
  local payload=$(python3 -c "
import json,sys
print(json.dumps({
  'projectKey': sys.argv[1],
  'milestoneKey': sys.argv[2],
  'sectionKey': sys.argv[3],
  'caseTitle': sys.argv[4],
  'description': sys.argv[5],
  'status': sys.argv[6],
}))
" "$PROJECT_KEY" "$MILESTONE_KEY" "$SECTION_KEY" "$title" "$desc" "$status")
  
  RESP=$(api POST "/testcase/add" "$payload")
  if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') or d.get('data') else 1)" 2>/dev/null; then
    echo "  ✓ $title"
    ((created++)) || true
  else
    echo "  ✗ FAILED: $title → $RESP"
    ((failed++)) || true
  fi
}

echo ""
echo "=== Creating test cases ==="

# ── SECTION: Call Package Pricing ────────────────────────────────────────────
echo ""
echo "--- 1. Call Package Pricing ---"
create_case \
  "Alejotwink 30-min package shows \$60.00 on creator profile" \
  "Navigate to Alejotwink's creator profile. Verify the 30-min call package card displays price \$60.00 USD. Steps: 1. Open /profile/Alejotwink or equivalent creator profile URL. 2. Scroll to Llamadas Privadas section. 3. Confirm card shows '30 min' and '\$60.00'. Expected: Price is exactly \$60.00."

create_case \
  "Alejotwink 60-min package shows \$100.00 on creator profile" \
  "Navigate to Alejotwink's creator profile. Verify the 60-min call package card displays price \$100.00 USD. Steps: 1. Open creator profile. 2. Scroll to Llamadas Privadas section. 3. Confirm card shows '60 min' and '\$100.00'. Expected: Only one active 60-min package at exactly \$100.00."

create_case \
  "No duplicate or deactivated call package visible (\$110 removed)" \
  "Verify the old duplicate 60-min \$110 package (pkg_id 129) is not shown. Steps: 1. Open Alejotwink's profile. 2. Count call package cards — should be exactly 2 (30 min and 60 min). Expected: Only 2 cards visible; no \$110 package."

create_case \
  "Reservar button opens BookCallModal for correct duration" \
  "Verify tapping a call package 'Reservar' button pre-selects the correct duration. Steps: 1. Click Reservar on the 30-min card. 2. BookCallModal opens pre-set to 30 min. 3. Repeat for 60-min card. Expected: Modal duration matches clicked package."

# ── SECTION: Post-Call Survey UI ─────────────────────────────────────────────
echo ""
echo "--- 2. Post-Call Survey UI ---"
create_case \
  "Survey modal renders 4 category star rows (Tech Quality, Performance, Presentation, Politeness)" \
  "After a call ends, open the survey modal. Verify 4 optional category rating rows are visible. Steps: 1. Complete a call booking. 2. Open PostCallSurveyModal. 3. In 'Rate specific aspects' section, confirm 4 StarRow components labeled: Tech Quality, Performance, Presentation, Politeness. Expected: All 4 rows with 5-star selectors (24px) visible."

create_case \
  "Overall star rating is required; submit disabled until selected" \
  "Verify Submit Feedback button is disabled until the overall rating (Section 1) is selected. Steps: 1. Open survey modal. 2. Confirm button has disabled/opacity-40 state. 3. Select any star in Overall Experience. 4. Confirm button becomes active. Expected: Submit disabled with rating=0, enabled with rating>=1."

create_case \
  "Category ratings are optional — can submit with only overall rating" \
  "Submit survey with only the overall rating filled in. Steps: 1. Select 4 stars for Overall Experience only. 2. Leave all category rows and text fields blank. 3. Click Submit Feedback. Expected: API call succeeds (200); only rating field in payload; no validation error."

create_case \
  "Re-clicking selected star deselects it (sets value back to 0)" \
  "Verify clicking an already-selected star deselects it. Steps: 1. Click 3rd star in Tech Quality row → value=3. 2. Click 3rd star again → value=0 (stars all unlit). Expected: Deselect behavior works via 'value === star ? 0 : star' logic."

create_case \
  "Survey modal scrolls on small screens (maxHeight 90dvh)" \
  "On a mobile viewport (375×667), verify the modal scrolls rather than overflowing. Steps: 1. Set viewport to 375×667. 2. Open survey modal. 3. The inner div has max-height: 90dvh and overflow-y: auto. Expected: All 4 sections reachable by scrolling; no content cut off."

create_case \
  "3 open-ended textareas present: tech improvement, app feedback, equipment feedback" \
  "Verify 'Help us improve' section contains 3 textareas with correct placeholder text. Steps: 1. Open survey modal, scroll to Section 3. 2. Confirm placeholder 1: 'What could be improved in the tech quality? (video, audio, connection...)'. 3. Confirm placeholder 2: 'Any feedback about the PNPtv app itself?'. 4. Confirm placeholder 3: 'Feedback about the creator's equipment or setup?'. Expected: 3 textareas with exact placeholder text."

create_case \
  "Share with creator checkbox defaults unchecked; shows correct disclosure text" \
  "Verify share_with_model checkbox is unchecked by default and shows correct text. Steps: 1. Open survey modal. 2. Scroll to Section 4 (Share with creator). 3. Confirm checkbox is unchecked. 4. Confirm label: 'Share this feedback with {creatorName}'. 5. Confirm subtext: 'They'll see your ratings and written responses. Your identity will be shown as your username.' Expected: Unchecked by default, correct disclosure text."

create_case \
  "Success state shown after submit; modal closes after 2500ms" \
  "Verify the success state appears after form submission. Steps: 1. Fill in overall rating. 2. Submit. 3. Checkmark + 'Thank you' message appears. 4. Wait 2500ms — modal closes automatically. Expected: Success shown immediately on API 200; auto-close exactly 2500ms later."

create_case \
  "Survey modal resets all state when reopened" \
  "Verify all fields reset when the modal is opened again. Steps: 1. Open modal, fill in data, close without submitting. 2. Reopen modal. 3. All ratings = 0, all text fields empty, checkbox unchecked, no error shown. Expected: Clean state on every open (useEffect dependency on 'open')."

# ── SECTION: Post-Call Survey API ────────────────────────────────────────────
echo ""
echo "--- 3. Post-Call Survey API ---"
create_case \
  "POST /api/webapp/bookings/:bookingId/survey — missing overall rating returns 400" \
  "Test that omitting 'rating' field returns 400. Steps: POST /api/webapp/bookings/VALID_ID/survey with body {}. Expected: 400 {error: 'rating must be an integer from 1 to 5'}."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — rating out of range returns 400" \
  "Test that rating=0 and rating=6 both return 400. Steps: 1. POST with {rating:0}. 2. POST with {rating:6}. Expected: Both return 400 with error about valid range 1-5."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — category rating out of range returns 400" \
  "Test that any category rating field outside 1-5 returns 400. Steps: POST with {rating:4, tech_quality:6}. Expected: 400 {error: 'Rating fields must be integers from 1 to 5'}."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — accepts all 9 fields and inserts correctly" \
  "Test full payload with all new fields. Steps: POST with {rating:5, tech_quality:4, performance_quality:5, presentation:3, politeness:4, feedback:'Great', tech_improvement:'Better mic', app_feedback:'App is smooth', equipment_feedback:'Good lighting', share_with_model:true}. Expected: 200 {success:true}; DB row has all 13 columns populated."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — duplicate submission returns 409" \
  "Verify UNIQUE constraint on credit_id prevents double submissions. Steps: 1. Submit survey for a completed booking. 2. Submit again for the same booking. Expected: Second call returns 409 {error: 'Survey already submitted for this booking'}."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — share_with_model=true triggers creator email" \
  "Verify creator receives survey copy when member opts in. Steps: 1. Submit survey with share_with_model:true. 2. Check creator's email inbox. Expected: Email with subject 'New call feedback from {memberUsername}', rating table, and non-empty text feedback sections."

create_case \
  "POST /api/webapp/bookings/:bookingId/survey — unauthenticated returns 401" \
  "Verify survey endpoint requires session auth. Steps: POST without session cookie. Expected: 401."

# ── SECTION: Post-Call Email ──────────────────────────────────────────────────
echo ""
echo "--- 4. Post-Call Email ---"
create_case \
  "Post-call survey invite email sent to member after _onCallCompleted fires" \
  "Verify member receives the survey invite email when creator marks booking complete. Steps: 1. Creator calls POST /api/webapp/bookings/:bookingId/complete. 2. Check member's email. Expected: Email with subject 'How was your call with {creatorName}?', lists 4 rating categories and 3 open-ended questions, includes 'Rate Your Call' CTA button."

create_case \
  "Survey invite email lists all 4 rating categories and 3 open-ended questions" \
  "Verify the post-call email body describes all survey dimensions. Expected content in email: • Tech Quality — How was the video/audio connection? • Performance — How was the overall experience? • Presentation — How was the creator's appearance and setting? • Politeness — How courteous and professional? Plus mentions tech quality improvements, app feedback, equipment/setup feedback."

create_case \
  "Creator survey copy email shows rating table with star symbols" \
  "When share_with_model=true, verify creator receives formatted email. Steps: 1. Submit survey with all ratings + share_with_model=true. 2. Check creator email. Expected: Rating table rows for Overall/Tech Quality/Performance/Presentation/Politeness each showing ★ filled stars and ☆ empty stars. Only non-empty text responses shown."

# ── SECTION: Creator Tips — Frontend ─────────────────────────────────────────
echo ""
echo "--- 5. Creator Tips — Frontend ---"
create_case \
  "'Send a Tip' button visible on creator profile page" \
  "Verify the tip button appears on the creator profile below the call packages section. Steps: 1. Navigate to a creator profile (e.g., /profile/alejotwink). 2. Scroll past call packages section. 3. Find 'Send a Tip' button. Expected: Button visible with dollar-sign icon and 'Send a Tip' label."

create_case \
  "Tip panel expands inline below button on click" \
  "Verify clicking 'Send a Tip' expands the tip form inline (not bottom of page). Steps: 1. Click 'Send a Tip' button. 2. Panel expands in place showing amount presets, message field, disclosure, and payment button. Expected: Inline expansion, not a modal or page navigation."

create_case \
  "100% disclosure banner visible with correct green styling" \
  "Verify the tip disclosure message is prominently shown. Steps: 1. Open tip panel. 2. Find green disclosure banner. Expected exact text: '💚 100% of your tip goes directly to [creator name] — no platform fee whatsoever. Tips are fully exempt from any commission.' Green background (rgba(52,199,89,0.08)), green border and text."

create_case \
  "Preset tip amounts (\$5, \$10, \$20, \$50, \$100) toggle correctly and sync with input" \
  "Verify preset buttons update the amount and stay in sync with the custom input. Steps: 1. Click \$20 preset → custom input shows 20, \$20 button highlighted. 2. Type '35' in input → no preset highlighted, input shows 35. 3. Click \$50 → input updates to 50. Expected: Two-way sync between presets and input."

create_case \
  "Custom amount input enforces min \$1, max \$500" \
  "Verify manual amount input clamps to [1, 500]. Steps: 1. Type '-5' → value clamps to 1. 2. Type '0' → clamps to 1. 3. Type '600' → clamps to 500. Expected: Values outside range auto-corrected on change."

create_case \
  "Optional message field accepts up to 500 characters" \
  "Verify message textarea truncates at 500 chars. Steps: 1. Paste 501-character string. 2. Field shows only first 500. Expected: Max 500 chars enforced via slice(0, 500)."

create_case \
  "'Send Tip via Crypto' opens centered NowPayments popup" \
  "Verify clicking the payment button opens a popup window. Steps: 1. Fill in tip amount. 2. Click 'Send \$X Tip via Crypto'. 3. Popup opens centered on screen (width=min(520,screen-40), height=min(700,screen-40)). Expected: window.open() called with NowPayments invoiceUrl; popup centered; button shows 'Opening payment...' while pending."

create_case \
  "Poll detects completed payment and shows success banner" \
  "Verify the 5-second poll detects status=completed and shows success. Steps: 1. Send tip. 2. Complete NowPayments payment. 3. Within 5 seconds, poll fires. 4. On completed: popup closes, tip panel collapses, green success banner 'Tip sent! Thank you for supporting {name}.' Expected: Auto-detection without manual refresh."

create_case \
  "X button closes tip panel and resets error state" \
  "Verify the close (X) button dismisses the tip panel cleanly. Steps: 1. Open tip panel. 2. If error showing, verify it's dismissed. 3. Click X. 4. Panel collapses back to 'Send a Tip' button. Expected: Panel hidden, tipError cleared, tipPending=false."

# ── SECTION: Creator Tips — Backend ──────────────────────────────────────────
echo ""
echo "--- 6. Creator Tips — Backend ---"
create_case \
  "POST /api/webapp/creators/:creatorId/tip — requires authentication (401)" \
  "Verify tip endpoint blocks unauthenticated requests. Steps: POST without session cookie. Expected: 401 {error: 'Not authenticated'}."

create_case \
  "POST /api/webapp/creators/:creatorId/tip — amount below \$1 returns 400" \
  "Verify minimum tip amount validation. Steps: POST with {amount: 0.5}. Expected: 400 {error: 'Amount must be between \$1 and \$500.'}."

create_case \
  "POST /api/webapp/creators/:creatorId/tip — amount above \$500 returns 400" \
  "Verify maximum tip amount validation. Steps: POST with {amount: 500.01}. Expected: 400 {error: 'Amount must be between \$1 and \$500.'}."

create_case \
  "POST /api/webapp/creators/:creatorId/tip — self-tip returns 400" \
  "Verify a user cannot tip themselves. Steps: Authenticate as a creator; POST to tip themselves. Expected: 400 {error: 'You cannot tip yourself'}."

create_case \
  "POST /api/webapp/creators/:creatorId/tip — unknown creator returns 404" \
  "Verify 404 for non-existent creator username. Steps: POST to /api/webapp/creators/nonexistentuser123/tip. Expected: 404 {error: 'Creator not found'}."

create_case \
  "Successful tip creates dash_subscription_orders row with plan_id='creator_tip'" \
  "Verify DB state after a successful tip creation. Steps: 1. POST valid tip. 2. Query dash_subscription_orders WHERE btcpay_invoice_id=orderId. Expected: Row exists with plan_id='creator_tip', status='pending', correct user_id and creator_id, usd_amount=10."

create_case \
  "Successful tip creates creator_tips row with pending status" \
  "Verify creator_tips table receives a row on tip creation. Steps: 1. POST valid tip. 2. Query creator_tips WHERE order_id=orderId. Expected: Row with payer_id, creator_id, amount_usd=10.00, status='pending', message if provided."

create_case \
  "GET /api/webapp/creators/:creatorId/tip/status/:orderId — returns status and amount" \
  "Verify the polling endpoint returns correct data. Steps: 1. Create a tip (orderId returned). 2. GET /status/:orderId authenticated as payer. Expected: 200 {success:true, status:'pending', amount:'10.00'}."

create_case \
  "GET /api/webapp/creators/:creatorId/tip/status/:orderId — 404 for unknown orderId" \
  "Verify 404 for non-existent or other user's order. Steps: GET with random orderId. Expected: 404 {error: 'Order not found'}."

create_case \
  "Tip rate limiter blocks more than 5 requests per hour" \
  "Verify creatorTipLimiter (5 per hour) protects the endpoint. Steps: Send 6 tip creation requests in under 1 hour from same IP. Expected: 6th request returns 429 Too Many Requests."

# ── SECTION: Creator Tips — Webhook Settlement ───────────────────────────────
echo ""
echo "--- 7. Creator Tips — Webhook Settlement ---"
create_case \
  "NowPayments IPN with invalid HMAC signature returns 400" \
  "Verify webhook rejects tampered requests. Steps: POST to /api/webhooks/nowpayments with wrong x-nowpayments-sig header. Expected: 400 {error: 'invalid_signature'}."

create_case \
  "NowPayments IPN with non-existent payment_id returns 400 (test IPN guard)" \
  "Verify webhook rejects test IPNs with fake payment IDs. Steps: Send valid HMAC IPN with payment_id=99999999. Expected: 400 {error: 'payment_not_found'} (NowPayments API returns 404 for fake ID)."

create_case \
  "Tip webhook: creator_earnings.amount_creator = full gross amount (100%)" \
  "Verify 100% earnings allocation. After settled tip: creator_earnings row WHERE source_payment_id=orderId. Expected: amount_creator = amount_gross (e.g., both = 10.00)."

create_case \
  "Tip webhook: creator_earnings.amount_platform = 0" \
  "Verify no platform commission on tips. After settled tip: creator_earnings.amount_platform = 0.00."

create_case \
  "Tip webhook: creator_earnings.is_tip = true" \
  "Verify the is_tip flag is set correctly. After settled tip: creator_earnings.is_tip = TRUE."

create_case \
  "Tip webhook: creator_earnings.status = 'available' immediately (no hold period)" \
  "Verify tips are available immediately (unlike regular earnings which have a 168h hold). After settled tip: creator_earnings.status = 'available', available_at <= NOW()."

create_case \
  "Tip webhook: creator_tips.status = 'completed' after settlement" \
  "Verify creator_tips row updates on payment. After webhook fires: creator_tips WHERE order_id=X has status='completed', completed_at IS NOT NULL, earnings_id IS NOT NULL."

create_case \
  "Tip webhook: dash_subscription_orders.status = 'completed' after settlement" \
  "Verify DSO status update. After webhook: dash_subscription_orders WHERE btcpay_invoice_id=orderId has status='completed'."

create_case \
  "Tip webhook is idempotent — duplicate IPN does not double-credit earnings" \
  "Verify ON CONFLICT DO NOTHING prevents duplicate earnings. Steps: Fire same finished IPN twice with same order_id. Expected: Only one creator_earnings row; second insert is silently ignored."

create_case \
  "Refund IPN: creator_tips.status = 'refunded'" \
  "Verify refund path marks tip correctly. Steps: Fire IPN with payment_status='refunded' for a completed tip. Expected: creator_tips.status = 'refunded'."

create_case \
  "Refund IPN: creator_earnings.status = 'void'" \
  "Verify refund path voids the earnings. Steps: Fire refund IPN for a settled tip. Expected: creator_earnings WHERE source_payment_id=orderId has status='void'."

# ── SECTION: Admin Dashboard — Book a Call ───────────────────────────────────
echo ""
echo "--- 8. Admin Dashboard — Book a Call ---"
create_case \
  "/admin/calls page loads for admin users without error" \
  "Verify the new Call Analytics admin page is accessible. Steps: 1. Log in as admin. 2. Navigate to /admin/calls. Expected: Page loads, no 404 or JS error."

create_case \
  "/admin/calls shows in sidebar nav for admin and creator-admin users" \
  "Verify 'Book a Call' nav item appears in AdminLayout sidebar. Steps: 1. Log in as admin → 'Book a Call' visible in sidebar. 2. Log in as creator-admin → also visible (creatorAllowed: true). Expected: Item present for both roles."

create_case \
  "Survey summary cards show correct metrics (total, avg overall, avg per category)" \
  "Verify survey metrics display correctly. Steps: 1. Open /admin/calls. 2. Check Summary section. Expected: Cards for Total Surveys, Avg Rating, Avg Tech Quality, Avg Performance, Avg Presentation, Avg Politeness — all populated with numeric values (or 0 if no data)."

create_case \
  "Top creators by rating table shows all 5 rating dimensions" \
  "Verify the top creators table has correct columns. Steps: Open /admin/calls → Creators table. Expected columns: Creator, Survey Count, Overall, Tech, Performance, Presentation, Politeness — at least 2 surveys required to appear."

create_case \
  "Recent text feedback section shows non-empty feedback only" \
  "Verify the feedback feed filters out empty submissions. Steps: Open /admin/calls → Recent Feedback section. Expected: Only surveys with at least one non-empty text field (feedback/tech_improvement/app_feedback/equipment_feedback) appear."

create_case \
  "Tip summary cards show: completed tips count, total USD, avg tip, max tip" \
  "Verify tip metrics display correctly. Steps: 1. Open /admin/calls. 2. Find Tips section. Expected: Cards for Completed Tips, Total USD Tipped, Avg Tip, Max Tip — populated correctly (90-day window)."

create_case \
  "Top tipped creators table ranks by total USD received" \
  "Verify tip leaderboard ordering. Steps: Open /admin/calls → Top Tipped Creators table. Expected: Rows sorted by total_usd DESC; columns: Creator, Tips Count, Total USD, Avg USD."

create_case \
  "Recent tips table shows payer, creator, amount, currency, date" \
  "Verify recent tips table completeness. Steps: Open /admin/calls → Recent Tips table. Expected: All 5 columns present for last 20 tips."

create_case \
  "GET /api/admin/analytics/calls returns 200 for admin" \
  "Verify the analytics endpoint is accessible. Steps: GET /api/admin/analytics/calls with admin session. Expected: 200 {success:true, callAnalytics:{...}, tipAnalytics:{...}}."

create_case \
  "GET /api/admin/analytics/calls returns 403 for non-admin users" \
  "Verify adminGuard protects the endpoint. Steps: GET /api/admin/analytics/calls with regular user session. Expected: 403."

echo ""
echo "=============================="
echo "Created: $created test cases"
echo "Failed:  $failed"
echo "=============================="
