# PNPtv Broadcast Calendar — Rolling 4 Weeks

**Owner:** Santino. **Cadence:** 2 broadcasts/week (never zero — the Aug→Oct 60-day silence cost us 65% of signups).
**Template:** `broadcast-TEMPLATE.js`. **Fire via** `/opt/pnptvapp/scripts/run-broadcast-generic.sh <script>` (same isolated docker-run pattern as the explainer send).

## Weekly cadence

| Day | Slot | Theme | Audience |
|---|---|---|---|
| **Tue** | 20:00 UTC | **Spotlight** — rotate: feature deep-dive · creator highlight · new PNP Channels drop | all active non-banned |
| **Sat** | 15:00 UTC | **Conversion** — rotate: PRIME upsell · trial-expired win-back · Lifetime scarcity | non-PRIME active last 60d |

Rationale: Tue hits mid-week attention gap. Sat is highest open-rate in queer-nightlife-adjacent audiences (pre-weekend planning window).

## Next 4 weeks

### Week of 2026-10-06
- ~~Sun Oct 06 12:00 — comeback DM, Sep-21 trial churners~~ (**scheduled**, `broadcast-comeback-sep21-churners-2026-10-06.js`)
- Tue Oct 07 20:00 — **Spotlight: Private Calls** — "book 1:1 with Santino or Lex this week" + hero
- Sat Oct 11 15:00 — **PRIME upsell** — "weekend inside: 7 days for $14.99"

### Week of 2026-10-13
- Tue Oct 14 20:00 — **Spotlight: PNP Channels new drops** — show what landed since Oct 1
- Sat Oct 18 15:00 — **Lifetime scarcity** — "$249 locks it forever — only 50 slots this month"

### Week of 2026-10-20
- Tue Oct 21 20:00 — **Creator highlight** — featured creator of the week (rotate; needs creator opt-in via Slack #ext-channel)
- Sat Oct 25 15:00 — **PRIME upsell variant** — focus on Hangouts rooms

### Week of 2026-10-27
- Tue Oct 28 20:00 — **Feature deep-dive: Nearby** — "see who's online near you right now"
- Sat Nov 01 15:00 — **November warm-up / Halloween weekend recap**

## Standing rules (per feedback files)

- Marketing is EN+ES bilingual.
- Desire-first, never fear-first.
- No payment brand names in user copy — "pay with card" / "pay with crypto" only.
- "Ru$h 💎" never in user-facing text; call it 💎 or omit (per the Oct 2 edit).
- Match in-app nav labels — "PNP Channels" not "Videorama", "Live" not "Live Shows".
- "Whale Pig" and "PNPtv Fam" are internal — never in broadcast.
- Hero image + ONE CTA. No stacked payment URLs.
- Force-include Santino (8599671840) + Lex in every send.
- Dedup via `meta.broadcastId = <unique-slug>-YYYY-MM-DD`. Never reuse the slug within a campaign window.

## Deployment pattern

```bash
# 1. Copy the template
cp apps/backend/scripts/broadcast-TEMPLATE.js \
   apps/backend/scripts/broadcast-prime-upsell-2026-10-11.js

# 2. Edit: BROADCAST_ID, AUDIENCE_SQL, COPY.en, COPY.es, HERO.*

# 3. Dry-run (shows audience + sample copy, no writes)
/opt/pnptvapp/scripts/run-broadcast-generic.sh broadcast-prime-upsell-2026-10-11.js --dry-run

# 4. Fire
/opt/pnptvapp/scripts/run-broadcast-generic.sh broadcast-prime-upsell-2026-10-11.js
```

## Watchdog interlock

The `pnptv-watchdog` cron alerts if **zero broadcast campaigns fire in 7 days.**
If you ever see that alarm → ship something immediately. The 60-day blackout from Aug 2 was the single biggest driver of the revenue cliff.
