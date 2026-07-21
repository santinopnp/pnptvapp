# Content Compliance Notice Copy — DRAFT, pending human sign-off

**This is draft copy only.** Nothing here goes out to a real creator until a
human reviews and approves the wording. This file exists so that review can
happen without reading through `contentComplianceService.js`.

Implemented in `apps/backend/services/contentComplianceService.js`:
- `_sendComplianceStartedNotice(creatorId, deadline)`
- `_sendComplianceAchievedNotice(creatorId, unlockedCount)`

Each notice fans out through two channels:
1. `NotificationEmitter.emit()` — in-app notification + push + Telegram bot DM (single `message` string, plus a short `pushTitle`/`pushBody` pair in `metadata`).
2. `EmailService.send()` — only when the creator has a **verified** email on file (`users.email_verified = true`).

---

## 1. Compliance clock started ("7-day compliance notice")

Fires from `startComplianceClockIfNeeded()` the first time a creator picks up
a `creator_monthly` subscriber without having 4+ minutes of exclusive video
content on file. Deadline = `NOW() + CONTENT_COMPLIANCE_GRACE_DAYS` (7 days).

### In-app / push / bot (`NotificationEmitter`)

**Push title:**
> Action required — new subscriber on hold

**Push body:**
> Upload 4+ min of exclusive video by {deadline date} to activate your new subscriber's membership.

**In-app message (also used as bot DM text):**
> You have a new subscriber, but per platform guidelines your profile needs at least 4 minutes of exclusive video content before their membership starts. You have until {deadline date} to upload — please complete this by then to avoid a 6-month suspension from the Creator Program.

### Email (only if verified email on file)

**Subject:**
> Action required — your new subscriber is on hold

**Body:**
> Hi,
>
> You have a new paid subscriber! Before we can start their membership and your earnings, our platform guidelines require your creator profile to have at least **4 minutes** of exclusive video content.
>
> You currently do not meet this minimum. Please upload qualifying exclusive video content by **{deadline date}**.
>
> If you upload in time, your subscriber's membership (and your earnings) will start automatically as soon as you qualify — no action needed beyond uploading.
>
> If the deadline passes without enough content, your Creator Program account will be suspended for 6 months, and the held subscriber will be refunded.
>
> Thanks for helping us keep the platform's content standards consistent for everyone.

---

## 2. Compliance achieved ("you're compliant, clock started")

Fires from `markCompliantIfNewlyQualified()` once the creator crosses the
4-minute threshold while their status was `pending`. `unlockedCount` is the
number of previously-held subscriptions that were just released.

### In-app / push / bot (`NotificationEmitter`)

**Push title:**
> You're compliant!

**Push body / in-app message** (varies slightly by whether any subscriptions were actually held):
> You're now compliant with the content requirement — your held subscriber's/subscribers' membership has officially started. Earnings will follow the normal hold schedule.

Fallback wording if `unlockedCount === 0` (compliance achieved with nothing currently held, e.g. proactive upload before any subscriber existed):
> You're now compliant with the content requirement. Any future subscribers will start immediately.

### Email (only if verified email on file)

**Subject:**
> You're compliant — your subscriber's membership has started

**Body:**
> Hi,
>
> Good news — your profile now meets the platform's content requirement. Your held subscriber's/subscribers' membership has officially started.
>
> Your earnings from this subscription will follow the normal hold schedule and become available as usual.
>
> Thanks for getting this done!

---

## 3. Subscriber refund notice ("your subscription was cancelled and refunded in tokens")

Fires from the content-compliance deadline-enforcement cron job (`scripts/cron.js`,
daily at 09:05 UTC) for every `creator_subscriptions` row with `compliance_hold = true`
belonging to a creator who missed their 7-day grace deadline. The subscription is
cancelled and the subscriber is credited `round(price_usd * 6 * CONTENT_COMPLIANCE_REFUND_MULTIPLIER)`
tokens (6 tokens = $1 USD base rate; 105% of what they paid).

### In-app / push / bot (`NotificationEmitter`)

**Push title:**
> Subscription refunded in tokens

**Push body:**
> You've been credited {N} tokens after a creator's subscription was cancelled.

**In-app message (also used as bot DM text):**
> The creator you subscribed to didn't meet the platform's content requirement in time, so their new membership hold could not be lifted. Your subscription has been cancelled and we've credited your wallet with {N} tokens (105% of what you paid) as an apology for the inconvenience.

### Email (only if verified email on file)

**Subject:**
> Your subscription was cancelled and refunded in tokens

**Body:**
> Hi,
>
> The creator you recently subscribed to did not meet our platform's content requirement (at least 4 minutes of exclusive video content) within the required time window.
>
> As a result, their new-subscriber hold could not be lifted, and your subscription has been cancelled.
>
> We've credited your wallet with **{N} tokens** — 105% of what you paid — to make this right.
>
> We're sorry for the inconvenience. Please don't hesitate to reach out if you have any questions.

---

## 4. Creator suspension notice ("you've been suspended from the Creator Program")

Fires from the same deadline-enforcement cron job, once per creator, when their
7-day content-compliance grace deadline passes without reaching 4+ minutes of
exclusive video content. Sets `creator_status = 'suspended'`,
`creator_suspension_reason = 'content_compliance'`, and
`creator_suspended_until = NOW() + 6 months`.

### In-app / push / bot (`NotificationEmitter`)

**Push title:**
> Creator Program suspension

**Push body / in-app message (also used as bot DM text):**
> You've been suspended from the Creator Program for 6 months for not meeting the platform's content requirement (4+ minutes of exclusive video content) within the grace period. You'll be eligible to rejoin around {reinstatement date}.

### Email (only if verified email on file)

**Subject:**
> Your Creator Program account has been suspended

**Body:**
> Hi,
>
> Your Creator Program account has been suspended for 6 months because our platform's content requirement (at least 4 minutes of exclusive video content) was not met within the required grace period.
>
> Your held subscriber(s) have been refunded in tokens and their subscription(s) cancelled.
>
> You'll be eligible to rejoin the Creator Program around **{reinstatement date}**.
>
> If you believe this is a mistake, please contact support.

---

## 5. Deadline-approaching reminder ("1-2 days left")

Fires from a separate daily cron phase (also `scripts/cron.js`, 09:05 UTC) for
creators whose compliance deadline falls 1-2 days out. The daily cadence means
this window naturally catches each pending creator exactly once.

### In-app / push / bot (`NotificationEmitter`)

**Push title:**
> Reminder — content deadline approaching

**Push body:**
> Upload 4+ min of exclusive video by {deadline date} to avoid suspension.

**In-app message (also used as bot DM text):**
> Reminder: you have until {deadline date} to upload at least 4 minutes of exclusive video content, or your Creator Program account will be suspended for 6 months and your held subscriber(s) refunded.

### Email (only if verified email on file)

**Subject:**
> Reminder — your content compliance deadline is approaching

**Body:**
> Hi,
>
> This is a reminder that you have until **{deadline date}** to upload at least 4 minutes of exclusive video content to your creator profile.
>
> If the deadline passes without enough content, your Creator Program account will be suspended for 6 months, and your held subscriber(s) will be refunded in tokens.
>
> Upload now to activate your held subscriber's membership and start earning.

---

## Not covered here (handled elsewhere)

Auto-reinstatement (Phase C of the cron job, restoring `creator_status = 'active'`
once a 6-month content-compliance suspension elapses) sends **no notification**
per the plan — it's considered out of scope for the initial rollout.
