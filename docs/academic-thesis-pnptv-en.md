# TECHNOLOGICAL SOVEREIGNTY AND ETHICAL TALENT MANAGEMENT:
## Toward a New Human Resources Paradigm in Sex Work
### The PNPtv Case as an Applied Duty of Care Model — Edition with Technical Audit of the Production Repository

**Thesis / Research Paper — Revised Edition**  
Prepared with direct access to the production code repository (August 2026)

---

## Editorial Note on This Edition

The original thesis (2026) explicitly declared its principal limitation: it had no access to the PNPtv source code, and all claims about its technological implementation had to be read as "narrative declared by the project, not as a verified technical fact." This revised edition corrects that gap: the production repository at `/opt/pnptvapp` was audited directly, making it possible to compare each of PNPtv's declared principles against the modules actually deployed in production. The findings transform the "Verification status" column of Table 4.4 from its previous state (100% declarative) into a map of partial confirmations and gaps identified with technical precision.

---

## Abstract

This paper examines the reconfiguration of Human Resources Management (HR) when applied to a sector historically excluded from formal labor protections: sex work. The revised edition incorporates a direct technical audit of the production repository of the PNPtv project, which makes it possible to replace the internal coherence hypothesis formulated in the original edition with empirical implementation evidence. The conclusion is that PNPtv has materialized in code the central pillars of the Duty of Care — identity verification (§ 2257), harm-reduction wellbeing, multi-chain financial protection, content moderation with thresholds contextualized for PNP, and a passwordless authentication architecture — while maintaining identified gaps in per-creator geoblocking, Self-Sovereign Identity (SSI/DIDs), and formal cooperative structure. These gaps do not invalidate the model; they define it as the future implementation agenda with the greatest impact on worker sovereignty.

**Keywords:** Human Resources, sex work, Duty of Care, self-sovereign identity, § 2257 verification, wellbeing and harm reduction, PNPtv, decriminalization.

---

## 1. Introduction

### 1.1 Statement of the Problem

The digitization of the global economy has transferred a vast proportion of labor relations to cyberspace, replicating and intensifying pre-existing structural inequalities. In sex work — and, more broadly, in adult content creation — this precarity assumes dimensions of vital risk: physical assault, mental health crises, problematic substance use, and a permanent digital exposure that is rarely managed with labor care instruments.

The question structuring this paper is the one that PNPtv's founding team formulated as the catalyst for their project: how are the tools of corporate management — talent acquisition, onboarding, compensation, occupational safety — adapted to dignify, protect, and empower the career of a sex worker without betraying their autonomy?

### 1.2 Methodology and Scope of the Technical Review

This revised edition employs direct source-code analysis as a complementary methodology to the documentary analysis of the original edition. The following modules from the production repository (`/opt/pnptvapp`) were audited:

- `apps/backend/services/` — 90+ business services
- `apps/backend/bot/api/` — controllers, routes, and middleware
- `apps/backend/config/` — monetization, access, and moderation configuration
- `apps/web/src/pages/` — user interface, wellbeing pages, and onboarding
- `apps/backend/models/` — data models and schemas

The analysis distinguishes between: (a) **implemented and verified in code**, (b) **declared architecture with dependency on environment credentials**, and (c) **not implemented / identified gap**.

---

## 2. Theoretical Framework (No Substantial Changes from the Original Edition)

The conceptual frameworks of the original edition — algorithmic subordination, platform cooperativism, Duty of Care as the HR axis — remain valid. This section condenses them to focus the analysis on the technical findings.

### 2.1 On the Legal Framework: New Zealand and Colombia

New Zealand's Prostitution Reform Act (2003) and Colombia's draft bill PL290 (2024–2025) represent the two reference poles in labor decriminalization. The former prioritizes autonomy and occupational health; the latter, formal social security coverage. PNPtv operates philosophically closer to the New Zealand model — autonomy, non-criminalization, Duty of Care — but its technical architecture, as will be seen, would be compatible with a compliance intermediary role in a post-PL290 environment.

### 2.2 The Duty of Care as a Reformulated HR Axis

The reformulation proposed in the original edition — HR as political infrastructure, not merely operational — is confirmed in PNPtv's architecture. Each classical HR function has a deployed technological equivalent:

| HR Function | Technological Tool | Status in PNPtv |
|---|---|---|
| Onboarding / identity verification | SSI + ZKP | **Partial** — § 2257 manual + Persona KYC; ZKP not implemented |
| Occupational safety and health | Harm reduction, reporting, content | **Implemented** |
| Privacy and confidentiality | IP geoblocking, location fuzzing | **Partial** — location yes; per-creator geoblocking no |
| Compensation / payroll | Multi-chain crypto + internal ledger | **Implemented** |
| Workplace climate / wellbeing | Wellness Mode, Self-Care Center, Use Tracker | **Implemented** |

---

## 3. The Technological Layer: Map of Real Implementation in PNPtv

This section replaces the hypothetical analysis of Section 3 of the original with findings verified in code.

### 3.1 Identity Verification Without PII Exposure: What Exists and What Is Missing

**Implemented:** The `identityVerificationService.js` module implements the identity verification process required by 18 U.S.C. § 2257 (the U.S. federal regulation on documentation of adult performers) with the following characteristics:

- **Upsert with version control:** a creator can resubmit their documentation if rejected; the system records the resubmission count and applies a 6-month suspension upon a second rejection for fraud.
- **Server-side age validation:** the date of birth is mathematically validated before being persisted; users under 18 are blocked with a typed error.
- **Temporary ban control:** `banned_from_applying_until` prevents resubmission abuse.
- **Persona integration:** the service supports the Persona.com hosted flow for automated government document verification, with HMAC-SHA256 webhook validation (5-minute window against replay attacks).
- **Custodian export:** the `export2257Records()` method includes custodian data (name, address, email) in conformance with 28 C.F.R. § 75.1(c).
- **Automatic creator tool unlock:** upon approval of verification, `checkAndMaybeUnlockCreator()` automatically releases uploads, streaming, and publishing.

Additionally, `ageVerificationService.js` implements age verification through image analysis using Azure Face API or Face++ (configurable by environment), with the following privacy guarantees: the photo buffer is discarded immediately after the API analysis (commented as `CRITICAL` in the code) and only the numerical result (estimated age, confidence, approved/rejected) is persisted in `age_verification_attempts`.

**What Is Missing:** The original edition referenced W3C Verifiable Credentials and Zero-Knowledge Proofs (ZKP) as the optimal standard for demonstrating legal majority age without exposing PII. PNPtv does not implement DIDs or VCs — the current flow requires sharing identity documents with the platform (via Persona or direct upload), which stores them in local paths (`id_document_path`, `id_selfie_path`). The philosophical difference is substantial: the current model is custodial (the platform holds the evidence); the SSI/ZKP model would be non-custodial (the performer proves without revealing). This is the most relevant technical gap for worker sovereignty in the domain of identity.

### 3.2 Financial Infrastructure: Multi-Chain Crypto with Operational Custody

**Implemented:** PNPtv's financial ecosystem is built in three verified layers:

**Layer 1 — Internal currency (Ru$h):** `tokenLedgerService.js` implements an append-only ledger for the internal Ru$h currency. Every mutation on `user_token_wallets` must pass through `credit()` or `debit()`, generating a row in `token_ledger`. The conversion ratio (1 USD = 6 tokens, with tiered bonuses per package) is fixed in configuration. Live stream tips are 100% for the creator (`TIP_CREATOR_RATE = 1.0`); content and memberships apply a 70/30 split (`CREATOR_REVENUE_RATE = 0.70`, `PLATFORM_COMMISSION_RATE = 0.30`). Earnings have a 7-day hold before becoming available for cashout.

**Layer 2 — Incoming payments (crypto):** NowPayments is the only active payment provider, processing payments in multiple cryptocurrencies. `paymentService.js` and `nowpaymentsPayoutService.js` manage the complete cycle including webhook idempotency.

**Layer 3 — Cashout (five channels):** `cashoutService.js` implements five withdrawal channels: Meru (phone handle), Bitcoin mainnet, Dash mainnet, USDT TRC-20, and USDT Base (EVM). Addresses are validated with regular expressions specific to each format (bech32 P2WPKH/P2TR for Bitcoin, TRC-20 `T[1-9A-HJ-NP-Za-km-z]{33}`, EVM `0x[0-9a-fA-F]{40}`). Per-request limits ($5,000) and per-day limits ($10,000) are enforced server-side.

**Security:** `paymentSecurityService.js` implements AES-256-CBC encryption for sensitive payment data; `fraudDetectionService.js` applies two real-time rules: velocity control (maximum 3 attempts in 5 minutes, with Redis TTL) and geographic anomaly detection (impossible velocity between transactions > 900 km/h).

**What Is Missing Relative to the 2026 Manual Catalog:** The current model is one of operational custody, not self-custody. The creator withdraws to their personal wallet, but funds in transit reside in the platform's accounts. Self-executing escrow smart contracts (to guarantee automatic payment release upon service completion) are not implemented. The risk of fraudulent chargebacks — identified in the original thesis as a critical vector of precarity — is mitigated by the irreversible nature of cryptocurrency payments, though not by on-chain escrow.

### 3.3 Security and Wellbeing: The Most Mature Implementation of the Duty of Care

This is the area where PNPtv most departs from declarative promise and most approaches concrete implementation. The following modules constitute, taken together, a wellbeing system without precedent on comparable platforms in the sector:

**Wellness Mode (`wellnessModeService.js`):** A self-imposed rest mode with configurable duration (1, 7, 30 days, or indefinite). The design incorporates deliberate friction: disabling the mode requires two steps separated by a 24-hour "cooling-off" period (`COOLING_OFF_HOURS = 24`). The code explicitly documents the reasoning: *"A boolean toggle is too easy to revert during a craving — the point is the friction."* While the mode is active, access to the platform is restricted to a whitelist of routes (settings, Cristina AI, wellbeing hangouts, harm-reduction use tracker, legal resources). The system accumulates completed wellbeing days (`wellness_days_accumulated`) for personal progress visibility.

**Self-Care Center (`SelfCareCenter.tsx`):** A dedicated page without advertising, without algorithms, and without notifications — designed with "deliberate visual space, soft gradients, slow movement" according to the comment in the code. It consolidates the Use Tracker, Wellness Mode, and direct access to Cristina (the companion AI) and to wellbeing groups.

**Use Tracker:** A private log of consumption sessions (`use_tracker_logs`), with types `slam` (injection) and `smoke`, personal frequency statistics, and a visualization of days since last use. The category system aligns with the chemsex terminology of the PNP environment, representing a level of cultural contextualization absent from any mainstream harm-reduction tool.

**Community Reporting System (`userReportService.js`):** Eight reporting categories with specific semantics: harassment, hate, spam_scam, impersonation, csam, nudity_nonconsensual, self_harm, other. CSAM triggers automatic escalation and immediate suspension of the reported account. A report generates automatic blocking of the target for the reporter. A limit of 5 daily reports per user prevents abuse of the system. The categories `self_harm` and `nudity_nonconsensual` (non-consensual) reflect active care protocols toward creators themselves.

**Contextualized Content Filter (`contentModerationFilter.js`):** This module is culturally notable. Unlike generic filters that block any reference to substances, PNPtv's filter is calibrated for the PNP context: generic terms (`meth`, `tina`, `pnp`, `chem`, `partying`) are NOT blocked — they are the legitimate vocabulary of the community. Only specific vectors of harm are blocked: `iv_drug_use` (injection/slamming language), `bug_chasing` (intentional HIV transmission language), `non_consent` (rape, facilitating drugs), `child_safety` (CSAM), `zoophilia`, `firearms` (arms sales), and `drug_sales` (substance trafficking, not personal use). This distinction between personal/recreational use and critical harm vectors is precisely the sophistication absent from the policies of platforms such as OnlyFans, which indiscriminately block any content related to the PNP world.

**What Is Missing Relative to the Original Catalog:** The physical/stealth panic button (the silent alert controlled by the worker, without requiring unlocking the phone during an assault) is not implemented. PNPtv operates in the digital domain, where this risk is lower; but for in-person services facilitated through the platform, this gap is relevant.

### 3.4 Privacy and Data Management: Passwordless Authentication and the Right to Erasure

**Passwordless authentication:** The routes `POST /api/webapp/auth/email/register` and `POST /api/webapp/auth/email/login` return HTTP 410 Gone with the message: *"Password registration has been removed. Use magic link or passkey."* PNPtv has completely eliminated password-based authentication. The system operates exclusively with passkeys (WebAuthn/FIDO2 — phishing-resistant by design), single-use magic links, and authentication via the Telegram widget. This architectural decision eliminates the largest attack surface in identity theft: the reusable password.

**Right to erasure (`selfEraseAccount`):** The route `DELETE /api/users/me/erase` implements hard deletion with an explicit confirmation gate (the user must send `{ "confirm": "DELETE MY ACCOUNT" }` in the request body). The endpoint is protected against rate-limiting. The `NoConsent` variant (without requiring active acceptance of terms) ensures that a user who never completed onboarding can equally erase their data.

**Location privacy (`nearbyService.js`):** Coordinates are rounded to 3 decimal places (~111 m of precision) before being stored. In the response, an HMAC-deterministic offset is applied (using the `userId` + `GEO_HMAC_SECRET` from the environment) that shifts the reported position by between 100 and 500 meters according to the privacy radius configured by the user. The offset is deterministic (the same user always sees the same offset) but not derivable by third parties without the HMAC key.

**What Is Missing:** Per-creator geoblocking (hiding one's own profile and content catalog from traffic originating from the creator's country or city of residence) is not implemented as a self-service feature. Country detection exists in middleware (`geo?.country`) for business decisions (such as displaying local payment options), but not as a privacy lever that the creator themselves can activate to protect against family ostracism or loss of alternative employment.

### 3.5 Systemic Security Architecture

**Centralized audit log (`AuditLogService.js`):** A log of administrative actions with actor, resource, before/after values, IP address, and user-agent. Queryable with filters for date, actor, and action type.

**Multi-vector platform ban (`platformBanService.js`):** A platform ban captures all known identity vectors of the user (Telegram ID, pnptv_id, email, X/Twitter, Bluesky, ATProto) plus all IPs recorded in their sessions. It revokes entitlements, clears active subscriptions, and sends a notification message to the user worded firmly but humanely (with the 💛 emoji and acknowledgment of the community).

**Appeals system (`appealService.js`):** Banned users have a public and authenticated appeals pathway, with rate-limiting per IP (1/hour, 3/day) and an anti-bot honeypot. The system resolves the appellant's identity through multiple identifiers (email, numeric ID, @username).

---

## 4. The PNPtv Case Revisited: From Declared Narrative to Verified Evidence

### 4.1 Updated Implementation Table

| Principle declared by PNPtv | Corresponding tool (2026 Manual) | Implementation verified in code | Residual gap |
|---|---|---|---|
| Dignify identity without exposing personal data | SSI + Verifiable Credentials / ZKP | **Partial**: § 2257 with Persona KYC + AI age verification with immediate buffer discard | SSI/DIDs/ZKP not implemented; current model is custodial |
| Shield against economic coercion | Cooperativism + stablecoins + self-custody | **Partial**: 70/30 split, multi-crypto cashout, Ru$h ledger, NowPayments | No on-chain escrow or true self-custody; cooperative structure not formalized |
| Mitigate physical and mental health risks | Operational Duty of Care + safety apps | **Implemented**: Wellness Mode with cooling-off, PNP-contextualized Use Tracker, PNP-calibrated content filter, CSAM auto-escalation, Self-Care Center | Stealth panic button not implemented |
| Avoid family and social ostracism | IP geoblocking / Geofencing | **Partial**: HMAC location fuzzing, coordinate rounding | Per-creator content geoblocking (by country/city) not implemented |
| Ethical accompaniment of onboarding and offboarding | Adapted HR framework | **Implemented**: complete § 2257 flow, passkey auth, magic link, `selfEraseAccount` with explicit gate | Formal offboarding protocol (exit interview, post-platform resources) does not exist as a module |
| Protection against community abuse | Reporting and moderation systems | **Implemented**: reporting with 8 categories, CSAM escalation, auto-block, contextualized content filter | — |
| Compensation transparency | Auditable ledger + transparent payroll | **Implemented**: append-only token_ledger, earning statements in CreatorEarnings.tsx | Ledger is neither public nor on-chain; auditable only by the creator themselves and by admins |

### 4.2 What the Original Thesis Underestimated

The original edition assumed that the technological catalog described in the 2026 Manual (SSI, DeFi, panic buttons, geoblocking) was the horizon toward which PNPtv aspired. Access to the code reveals something more interesting: PNPtv built tools without precedent on comparable platforms that the Manual's catalog did not describe:

1. **Wellness Mode with intentional design friction.** No adult content platform — neither OnlyFans, nor ManyVids, nor Fansly — implements a rest mode with a 24-hour cooling-off period designed explicitly to resist deactivation impulses during a craving. This is an innovation in wellbeing management that surpasses the state of the art in the sector.

2. **Use Tracker contextualized for chemsex/PNP.** The specific terminology (`slam`, `smoke`) and the philosophy of non-blocking of community vocabulary represent an understanding of cultural context that no mainstream harm-reduction system has achieved.

3. **Content filter with a distinction between personal use and vectors of harm.** The decision not to block `meth/tina/pnp` while blocking `slamming/hotshots/bug_chasing` requires a level of cultural sophistication that is only possible from the representational management described in Section 4.3 of the original document.

4. **100% passwordless authentication.** The total elimination of passwords (HTTP 410 on registration/login routes) is more radical than what most fintech and SaaS platforms implement in 2026.

### 4.3 Representativeness as a Management Method: Technical Confirmation

The original document cited PNPtv's foundational testimony about human validation as the cornerstone of its model. The code confirms that this philosophy permeates even engineering decisions: the comment in `wellnessModeService.js` explaining why the cooling-off exists ("*A boolean toggle is too easy to revert during a craving*") is not the language of a platform designing regulatory compliance features; it is the language of someone who has lived through the craving.

This validates the original document's hypothesis about "epistemological empathy as a management method": representational management — running a platform from the embodied experience of its workers — produces architectural decisions that are not reachable from the corporate pedestal.

---

## 5. Updated Discussion

### 5.1 HR as Political Infrastructure: Confirmed

The code analysis confirms the central thesis: in PNPtv, the HR function is not a corporate compliance module but a political infrastructure that redistributes power toward the worker. The elimination of passwords, the self-executed right to erasure, the earnings ledger auditable by the creator themselves, and the Wellness Mode with friction-by-design are technical decisions with concrete political consequences regarding who controls which data and under what conditions.

### 5.2 Unresolved Tensions (Updated)

**Custodial verification vs. sovereignty:** The current § 2257 system — government documents stored on PNPtv's server — represents the greatest point of concentration of sensitive PII across the entire platform. A security breach at this layer would exponentially increase the potential harm. The migration toward Persona.com (already initiated in the code) reduces but does not eliminate this risk, since Persona is also custodial. The implementation of VCs/ZKP would eliminate the problem by design.

**Internal ledger vs. on-chain transparency:** The Ru$h `token_ledger` is audited by the creator and by admins, but is not publicly verifiable. In a mature cooperative model, an on-chain ledger would allow creators to verify the fairness of the revenue distribution without depending on the platform's good faith.

**Pending geoblocking:** The absence of per-creator geoblocking is the most urgent gap for the daily privacy of creators who work in countries where sex work is prosecuted or in family environments that are unaware of their activity.

### 5.3 PNPtv and Comparative Regulatory Frameworks

The implemented architecture is more coherent with the New Zealand spirit (autonomy, occupational health, non-criminalization) than with the Colombian model (formal subordination, state social security). However, the § 2257 system with documentary custody, the 70/30 split formalized in code, and the retained earnings system could be articulated with Colombian ARL frameworks and the services contract regime of PL290, were there willingness to operate in that jurisdiction.

---

## 6. Revised Conclusions

**First.** The algorithmic subordination of digital sex work has in PNPtv a real technical counterweight: architectural decisions (passwordless auth, crypto cashout, Wellness Mode with friction) actively redistribute control toward the worker.

**Second.** The Duty of Care as an HR axis is implemented in its wellbeing and moderation dimension at a level of cultural sophistication without precedent in the sector. The harm-reduction tools (Wellness Mode, PNP-contextualized Use Tracker, calibrated filter) are innovations that surpass the state of the art described in the 2026 Manual catalog.

**Third.** The critical gaps are three: (a) per-creator geoblocking as a self-service privacy tool, (b) migration of the identity model from custodial to SSI/ZKP, and (c) formalization of the cooperative structure with democratic governance and an on-chain ledger.

**Fourth.** The hypothesis of "epistemological empathy as a management method" is confirmed: the most innovative engineering decisions in PNPtv (cooling-off in Wellness Mode, PNP vocabulary in the content filter, `self_harm` and `nudity_nonconsensual` categories in reporting) are only explicable from the embodied experience of those who designed them.

---

## References

*(The references from the original edition are retained. The following directly audited technical sources are added for this revision:)*

- PNPtv production repository, `/opt/pnptvapp` — reviewed August 2026:
  - `apps/backend/services/identityVerificationService.js` — § 2257 + Persona KYC
  - `apps/backend/services/ageVerificationService.js` — AI age verification
  - `apps/backend/services/wellnessModeService.js` — Wellness Mode with cooling-off
  - `apps/backend/services/tokenLedgerService.js` — Ru$h append-only ledger
  - `apps/backend/services/cashoutService.js` — multi-crypto cashout
  - `apps/backend/services/contentModerationFilter.js` — PNP-contextualized filter
  - `apps/backend/services/userReportService.js` — community reporting system
  - `apps/backend/services/platformBanService.js` — multi-vector ban
  - `apps/backend/services/nearbyService.js` — HMAC location fuzzing
  - `apps/backend/bot/api/routes.js` — auth routes (passkey, magic-link, erase)
  - `apps/web/src/pages/SelfCareCenter.tsx` — Self-Care Center
  - `apps/web/src/pages/WellnessShell.tsx` — wellbeing shell
  - `apps/backend/config/monetizationConfig.js` — commission structure

---

*This revision was prepared with direct access to the production code repository in August 2026. The analysis reflects the state of the code as of that date.*
