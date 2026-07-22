# Handoff: PNPtv! Crypto Onboarding Wizard — "Paying with crypto, made simple" (v2, screen-by-screen)

## Overview
Redesign of the crypto setup wizard in the PNPtv! mobile app. It replaces the earlier 3-long-page wizard (see `design_handoff_creator_profile_studio`) with an **8-screen, one-idea-per-screen flow** with far less text and a large wallet screenshot per setup step.

## About the Design Files
`Crypto Guide.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, NOT production code. It uses a custom templating runtime (`support.js`, `<x-dc>`, `sc-if`/`sc-for`, `{{ }}` holes) — ignore the runtime; read the markup/inline styles for visuals and the `class Component` block at the bottom for state and behavior. Recreate the screens in the target codebase's existing environment (React/Vue/native) with its established patterns. `<image-slot>` elements are drop-in screenshot placeholders — implement as plain `<img>` with the real wallet screenshots.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final intent. Media (wallet screenshots) are placeholders — supply real captures per wallet and step.

## Wizard chrome (all screens)
- Phone frame context: 393px wide screen, bg `#121212`, app bg `#0a0a0a`, black header bar with PNPtv! logo (26px tall) + hamburger icon
- Eyebrow: "GETTING STARTED" — 10px, 700, letter-spacing .12em, `#D4007A`
- Title: "Paying with crypto, made simple" — 18px, 700, white
- Step label: 12px `#A1A1A3` (e.g. "Step 3 of 7 — Create wallet")
- Progress bar: 5px, radius 99px, track `#1E1E1E`, fill `linear-gradient(90deg,#D4007A,#7B61FF)`, width = (screen+1)/8, `transition: width .3s`
- Footer nav (screens 2–8): "← Back" (flex 1, `#161616`, 1px `rgba(255,255,255,.15)` border, radius 10) + primary button (flex 2, radius 10, 13px 700). Primary bg = pink→purple gradient `linear-gradient(135deg,#D4007A,#7B61FF)` white text; on Add-money & Done screens it switches to teal `linear-gradient(90deg,#2DD4BF,#22D3EE)` with text `#04252b`. Labels: "Next →", "Done — take me to the app" (screen 7), "Finish" (screen 8)

## Screens (8)
State: `screen: 0–7`, `wallet: 0 (Trust Wallet) | 1 (MetaMask)`.

### 1. Intro + pick wallet (screen 0, no footer nav)
- "Crypto in 3 lines" card (`#161616`, 1px `#2A2A2A`, radius 14, padding 16): three ✓ rows (teal `#5ED1C4` check, 11px `#A1A1A3` text):
  1. "It's digital money you keep in a free 'wallet' app."
  2. "Load it once, like a gift card — no bank, no card details shared."
  3. "Setup takes ~2 minutes. After that, every payment is instant."
- H2 "Pick a wallet" (16px 700)
- Two wallet buttons (card style, radius 14, hover border `rgba(212,0,122,.6)`): 40px gradient icon square with letter, name 14px 700, one-line desc 11px, teal pill tag (PHONE / COMPUTER — 8px 700, bg `rgba(94,209,196,.14)`, border `rgba(94,209,196,.45)`, text `#5ED1C4`)
  - Trust Wallet — grad `linear-gradient(135deg,#3375BB,#5ED1C4)` — "Best if you use PNPtv on your phone."
  - MetaMask — grad `linear-gradient(135deg,#F6851B,#FFB454)` — "Best if you use PNPtv on a laptop."
- Muted footnote 11px `#6b6b70`: "Both are free — you can't pick wrong."
- Tapping a wallet selects it and advances to screen 1.

### 2. Install (screen 1)
- Picked-wallet card: 40px gradient square w/ first letter, wallet name, "Install it on your device:"
- Three download rows (card, radius 12, hover pink border): Apple logo "Download for iOS / App Store", Android logo (green `#22C55E`) "Download for Android / Google Play", Chrome logo (blue `#60A5FA`) "Add the Chrome extension / Chrome Web Store"; each with ↗ trailing
- GOOD TO KNOW callout (gold): left border 2px `#FFB454`, bg `rgba(255,180,84,.07)`, radius 0 8px 8px 0 — "Only use these links. Download links sent in chat are scams."

### 3–6. Wallet setup, one step per screen (screens 2–5)
Header row: 34px gradient number circle (1–4), eyebrow "{WALLET NAME} — SETUP n OF 4" (10px, .08em, `#A1A1A3`), step title 14px 700. One-line description 11px `#A1A1A3`. Then a **320px-tall screenshot** (radius 14, 1px `#2A2A2A` border) — one distinct image per wallet per step (8 total: tw-shot-1..4, mm-shot-1..4).

Trust Wallet steps: Tap "Create a new wallet" / Choose a passcode / Write down your 12 secret words / Confirm the words.
MetaMask steps: Click "Create a new wallet" / Create a password / Write down your 12 secret words / Confirm the words (then pin to toolbar).

Screens for steps 3–4 (secret words + confirm) also show the red callout: KEEP THIS SAFE — left border `#EF4444`, bg `rgba(239,68,68,.07)` — "Write the 12 words on paper. Never share them — PNPtv will never ask."

### 7. Add money (screen 6)
- Teal card (border `rgba(94,209,196,.35)`, bg `rgba(94,209,196,.06)`, radius 14): 40px teal check icon square + "Add money" / "Tap 'Buy' in your wallet and pay by card."
- Copy: 'Choose **USDT** or **USDC** — they're locked to the dollar, so your balance never moves on its own.'
- 280px screenshot slot (wallet "Buy" screen)
- Gold TIP callout: "Start with $20–30. You can always add more later."
- Primary button: teal gradient, "Done — take me to the app"

### 8. Done (screen 7)
Centered: 64px teal-gradient circle with dark check, "You're ready" 17px 700, "Spend it anywhere on PNPtv — no extra linking step." Then 3 link rows (card `#161616`, radius 10, pink `#FF4DA6` 12px 600): Subscribe to a creator →, Buy more tokens →, Browse all creators →.

## Interactions & State
- `wallet` selection on screen 0 drives all setup content and screenshots on screens 2–5
- Back decrements screen (screen 1 Back returns to wallet picker); Next increments; no other animations besides the progress-bar width transition
- Screens 3–8 keep the chosen wallet; changing wallet requires going back to screen 0

## Design Tokens
Same system as the app handoff: bg `#121212` / `#0a0a0a`, card `#161616`, nested `#111`, border `#2A2A2A`; text `#fff` / `#A1A1A3` / `#6b6b70` / callout body `#c9c9cc`; pink `#D4007A` (link `#FF4DA6`), purple `#7B61FF`, gold `#FFB454`, teal `#5ED1C4` / `#2DD4BF` / `#22D3EE` (dark text on teal `#04252b`), red `#EF4444`, green `#22C55E`, blue `#60A5FA`. Font: Roboto Mono 400–700 everywhere. Radii: cards 12–14, buttons 10, pills 999. Callout pattern: 2px colored left border + `rgba(color,.07)` bg + radius 0 8px 8px 0.

## Assets
- `public/logo.png` — PNPtv! logo (bundled)
- 9 wallet screenshots to capture: Trust Wallet ×4, MetaMask ×4, plus one "Buy" screen

## Files
- `Crypto Guide.dc.html` — the prototype (markup at top, `class Component` state/logic at bottom)
- `image-slot.js` — screenshot-placeholder runtime (prototype-only; not for production)
- `public/logo.png`
