# Privy Support Ticket — Orphan Wallet Recovery

**App ID:** `cmsihqsqu01rn0claoiqt4mw1` (PNPtv production)
**Contact:** Santino / Amplify Insights (California)
**Filed:** 2026-09-28

---

## To submit

Send via the Privy dashboard support widget, or email `support@privy.io` with the subject:

> **Orphaned server-wallet recovery — App `cmsihqsqu01rn0claoiqt4mw1`**

---

## Ticket body (paste this)

Hi Privy team,

I'm writing on behalf of **Amplify Insights** (California), operators of the PNPtv platform on Privy app ID `cmsihqsqu01rn0claoiqt4mw1`. We recently completed an internal audit that surfaced a large population of orphaned embedded wallets on our app, and I'd like your guidance on two questions before proceeding.

### What we found

Walking `/v1/wallets` for our app returns **1,160 total server wallets** owned by **670 unique `entity.id` values**. When we then GET `/api/v1/users/did:privy:{entity.id}` for each:

| Bucket | Entities | Wallets |
|---|---|---|
| Alive (200) | 41 (~5%) | ~57 |
| **Orphaned (404)** | **629 (~95%)** | **1,103** |

Of the 1,103 orphaned wallets:
- **137** have `exported_at` set — user or a past internal process exported the private key; potentially recoverable client-side.
- **966** have no `exported_at` — nobody outside of Privy holds the keys.

On-chain balance check across the 79 unique addresses among the 137 exported-key orphans:
- **Base:** 17 addresses hold $261.63 (USDC + ETH)
- **Ethereum L1:** 6 addresses hold $509.52 (USDC + ETH)
- **Total stranded:** ~$771 across ~22 unique addresses

### Two questions

1. **Recovery path for the 966 non-exported orphans.**
   Some of these may hold funds we haven't scanned yet (we prioritized the exported set because keys were reachable). If a user reports lost funds on one of these addresses, do you offer any shard-reconstruction or account-recovery flow on your end while the wallet still exists in `/v1/wallets`? Or is the fact that the owning `entity.id` returns 404 already terminal from your side?

2. **Retention policy for orphaned wallets.**
   How long do server wallets persist in `/v1/wallets` after their owning entity is deleted from the user API? We're asking so we can plan outreach urgency — if these wallets are on your side for another 90 days, we can broadcast to users first; if you're about to purge them, we need a different approach.

### Root cause on our end (for your context)

Past migration scripts on our side detected users transacting on Ethereum L1 when the app operates on Base, and:

1. Created new Privy accounts for those users (new embedded wallet on Base)
2. Migrated our DB to the new address
3. Exported the old account's key (marking `exported_at`)
4. Did NOT sweep funds off the old address
5. Later deleted the old Privy account

Combined with a write-once `COALESCE` bug in our own wallet linking service — which we fixed on 2026-09-27 and paired with a nightly reconciler that flags DB↔Privy drift — this stranded the funds detailed above.

We're not asking for anything unreasonable; the on-chain funds are cryptographically ours to spend if we have the keys. Just want to confirm the recovery paths before we tell affected users what's possible.

Happy to send the full orphan wallet list on request. Thanks —

**Santino**
Amplify Insights · PNPtv
`support@pnptv.app`

---

## Supporting attachments (send on request)

- Full list of 22 addresses with on-chain balance (Base + L1), with USD equivalents at 2026-09-27 spot
- Full list of 137 exported-key orphan `entity.id` values with `created_at` / `exported_at` dates
- `apps/backend/scripts/audit-orphaned-privy-wallets-2026-09-27.js` — our audit script if they want to reproduce
- Screenshot of any dashboard state Privy asks about
