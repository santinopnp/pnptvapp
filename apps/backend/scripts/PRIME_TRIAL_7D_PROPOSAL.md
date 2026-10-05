# PRIME Trial — 3d → 7d + In-Trial Nudges (Proposal)

**Status:** Needs Santino sign-off before implementation. Not shipped yet.

## Current state

| | |
|---|---|
| Plan | `prime-trial-3d` |
| Duration | 3 days |
| Conversion to paid (last 14d after Sep-21 expiry) | **5.1%** |
| Expiry cohort size | ~7,500 trial grants between Jul 06 → Sep 24 |
| Retargeting during trial | **none** |

5.1% is terrible. Industry benchmark for a 3-day no-retargeting trial is 8–12%; a 7-day trial with mid-trial nudges typically hits 15–20%.

## Proposal

1. **Rename `prime-trial-3d` → `prime-trial-7d`, duration `7 days`.** All new trial grants get 7 days. Existing active trials unchanged.
2. **Three in-trial nudge DMs from `@pnptv`**, triggered on a BullMQ job keyed to `granted_at`:
   - **Day +1** (24h after grant): "Welcome — here's where to start"
     - Point to PNP Channels + Live tab
     - No sell
   - **Day +4** (midway): "What you've been watching — here's what else is in PRIME"
     - Highlight 2–3 videos they haven't opened
     - Soft upsell: "Keep PRIME — $14.99/wk"
   - **Day +6** (last-call, 24h before expiry): "Last day — lock in PRIME"
     - Price anchor + 2 CTA options (weekly / lifetime)
3. **No price change.** PRIME week pass stays $14.99.

## Implementation sketch

- **DB migration:**
  ```sql
  UPDATE plans
     SET id='prime-trial-7d', name='PRIME 7-Day Trial', duration_days=7
   WHERE id='prime-trial-3d';
  ```
  (Or add a new plan + flip the trial-grant code to use it.)
- **Nudge scheduler:** new BullMQ job `prime-trial-nudges` running every 30 min, finds entitlements where `grant_source='trial'` AND `age(granted_at)` is in one of the 3 target windows (±15 min), AND dedup against `prime_trial_nudges_sent` log table.
- **Dedup table:**
  ```sql
  CREATE TABLE prime_trial_nudges_sent (
    user_id       text    NOT NULL,
    nudge_step    smallint NOT NULL,  -- 1 / 2 / 3
    entitlement_id bigint   NOT NULL,
    sent_at       timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, nudge_step, entitlement_id)
  );
  ```
- **Code location:** `services/primeTrialNudgeService.js` + `queueService.js` cron registration.

## Blast radius

- **Low** on the plan rename (existing trials keep their expires_at).
- **Medium** on the nudge DMs — 3 DMs per trial user over 7 days. If audience is noisy (lots of lapsed trial grants), could feel spammy. Mitigation: strict `age(granted_at)` window + 1 nudge per step.
- **Reversible** — flip a Redis kill switch to pause nudges, revert duration via migration.

## Decision needed from Santino

1. **GO on 3-day → 7-day trial?** (Doubles the free value, bets on better conversion.)
2. **GO on all 3 nudges, or start with just Day +6 (last-call)?** Minimal path = 1 DM, less noisy.
3. **Trial copy — I draft or you draft?**

Once decided, I ship the migration + service + queue entry in one PR behind a Redis kill switch `pnpapp:prime_trial_nudges:enabled`.

## Expected impact (back-of-envelope)

If conversion lifts from 5.1% → 12% on the next ~1,500 trial expirees/month:
- Extra paid conversions: ~104/month
- At $14.99 week pass: ~$1,560 extra MRR
- At $24.99 monthly pass (if we route them there): ~$2,600 extra MRR

Beats the current ~$1,000/mo total.
