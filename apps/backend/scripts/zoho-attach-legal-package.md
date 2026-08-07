# Zoho CRM ↔ Creator Legal Package — attachment handoff

**Status:** NOT ACTIVE. This is a paste-ready snippet for when the legal package
exits DRAFT (after Colombian counsel review). Do not run anything from this doc
until Santino signs off on the reviewed package.

**Legal package location:** `apps/web/public/docs/legal/creator/*.md` (9 docs) +
`index.html`. Published preview: <https://pnptv.app/docs/legal/creator/>.
Notion mirror: PNPtv! HQ → *Creator Partner Program — Legal & Policy Package
(DRAFT)*.

---

## Where the 2257 → Zoho Contact sync currently happens

`apps/backend/services/identityVerificationService.js:157-168` — fire-and-forget
`upsertContactByPnptvId` inside `setImmediate` after 2257 approval. Currently
sets `Verified_2257: true` and `Verification_Expires` (365d out).

This is the natural place to attach the legal-package acknowledgment once the
package goes live and creators are being asked to acknowledge on approval.

## Custom fields to add to Zoho Contacts module (before wiring)

| API name | Type | Default | Purpose |
|---|---|---|---|
| `Legal_Package_Version` | Single Line | `""` | e.g. `"v1.0-2026-08-07"` — bump every material update. |
| `Legal_Package_Acknowledged_At` | Date/Time | `null` | Set when creator confirms receipt (Slack DM click-through or in-app checkbox). |
| `Legal_Package_Signed_At` | Date/Time | `null` | Set when signable contracts (01, 02, 03) return from signing platform. |
| `Legal_Package_URL` | URL | `""` | Direct link to the version the creator saw (immutable snapshot, not the mutable HTML index). |

Add these via **Zoho CRM → Setup → Customization → Modules and Fields → Contacts → Layout**.

## Diff to apply inside `identityVerificationService.js` (once package live)

Add these fields inside the existing `upsertContactByPnptvId` call at line 161:

```js
await zoho.upsertContactByPnptvId(String(userId), {
  Verified_2257: true,
  Verification_Expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  // Legal package — sent on 2257 approval, awaits creator ack + sign in a separate step
  Legal_Package_Version: process.env.LEGAL_PACKAGE_VERSION || 'v1.0-2026-08-07',
  Legal_Package_URL: process.env.LEGAL_PACKAGE_URL || 'https://pnptv.app/docs/legal/creator/',
});
```

Set `LEGAL_PACKAGE_VERSION` + `LEGAL_PACKAGE_URL` in `.env.production` after
counsel-reviewed release. Version tag lets you audit which cohort saw which
draft.

## Slack DM copy to send on 2257 approval (once package live)

Post in `#ext-[handle]` (or DM Santino/Miguel-authored):

```
🎉 Your 2257 verification is approved — welcome to the PNPtv! Partner Program.

Here's your full onboarding package (read time ~90 min total):
https://pnptv.app/docs/legal/creator/

Please:
1. Read the Rights & Responsibilities Charter (doc 08) first — 10 min plain English.
2. Skim the other 8. Ask me anything in this channel.
3. Book your onboarding call: https://cal.com/pnptv/onboarding (30 min).
4. Signable contracts (NDA, Partner Agreement, Content License) will come
   through [signing platform TBD] once you've had a chance to read.

Nothing you sign is final until you've asked all your questions in this Slack
channel first. That's the whole point of `#ext-[handle]` — it's your line.

— Santino
```

## Notes-field fallback (if custom fields not yet provisioned)

Ops can paste this into a Zoho Contact's Notes field manually until the custom
fields are added:

```
LEGAL PACKAGE
Version: v1.0-2026-08-07 (DRAFT — counsel review pending)
URL: https://pnptv.app/docs/legal/creator/
Sent to creator: [date]
Acknowledged: [date] via [Slack / in-app]
Signed (01+02+03): [date] via [signing platform]
```

## Backfill for already-verified creators

At time of writing there are 32 verified creators + 59 in grace (per project
memory `project_2257_compliance_2026_05_07.md`). Once the counsel-reviewed
package is ready, ops should:

1. Ship the code change above.
2. Run a one-shot script that reads `users` where `is_2257_verified = true` and
   updates each Zoho Contact with the version + URL (this is a Zoho bulkUpsert
   call — see `services/zohoService.js:127 bulkUpsert`).
3. Send the Slack DM copy above to each creator (piggyback on the existing
   Slack-invite one-shot pattern from `scripts/slack-welcome-creators.js`).

Rough shape of the one-shot (do NOT run until authorised):

```js
// apps/backend/scripts/legal-package-backfill.js — DRAFT, do not run yet
const { query } = require('../db');
const zoho = require('../services/zohoService');

async function main() {
  const { rows } = await query(
    `SELECT id FROM users WHERE is_2257_verified = true`
  );
  const version = process.env.LEGAL_PACKAGE_VERSION || 'v1.0-2026-08-07';
  const url = process.env.LEGAL_PACKAGE_URL || 'https://pnptv.app/docs/legal/creator/';
  const records = rows.map(r => ({
    PNPtv_ID: String(r.id),
    Legal_Package_Version: version,
    Legal_Package_URL: url,
  }));
  // Batch of 100 max per Zoho call
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const results = await zoho.bulkUpsert('Contacts', batch, ['PNPtv_ID']);
    console.log(`Batch ${i / 100 + 1}: ${results.length} processed`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

---

**Do NOT wire any of this until:**
1. Colombian counsel returns edits and Santino signs off on the package.
2. Signing platform is chosen (DocuSign / Dropbox Sign / SignNow).
3. `legal@pnptv.app` inbox is provisioned.
4. Zoho custom fields listed above are created.
5. `LEGAL_PACKAGE_VERSION` and `LEGAL_PACKAGE_URL` are set in `.env.production`
   with the counsel-approved values.

Owner: Santino (approval) + ops team (execution).
