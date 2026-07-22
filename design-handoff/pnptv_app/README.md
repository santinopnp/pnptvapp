# Handoff: PNPtv App — 12-Screen Mockup

## Overview
High-fidelity mockup of the PNPtv creator-streaming platform: 8 mobile screens (viewer flow) and 4 desktop screens (web home, creator studio, admin console, shop). Built against the @pnptv/ui-kit design system.

## About the Design Files
The files in this bundle are **design references created in HTML/JSX** — prototypes showing intended look and behavior, NOT production code to copy directly. Your task is to **recreate these designs in the target codebase** (the real PNPtv app: React/Next.js in `apps/web`, `apps/studio`) using its established patterns, components, and the published `@pnptv/ui-kit` package. Do not ship these files as-is.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final intent. Recreate pixel-perfectly using the codebase's existing `@pnptv/ui-kit` components (`Button`, `Card`, `Badge`, `Input`, `Modal`, `Skeleton`) and Tailwind `pnp-*` utility classes.

## Design Tokens
From @pnptv/ui-kit (use Tailwind classes, never raw hex):
- Background `#121212` (`bg-pnp-background`), surface `#1e1e1e` (`bg-pnp-surface`), surface hover `#2a2a2a`, border `#2a2a2a` (`border-pnp-border`)
- Text primary `#ffffff`, secondary `#a1a1a3`
- Accent magenta `#D4007A` (`bg-pnp-accent`), hover `#E6198E`; amber `#E69138`; error `#FF453A`
- Brand gradient: `linear-gradient(135deg,#D4007A,#E69138)` — use `.btn-gradient` for CTAs, `.badge-gradient` for badges
- Headings: "Ethnocentric Rg" (auto-applied to h1/h2/h3 — use real heading tags). Body: "Roboto Mono".
- Radius: cards 12–14px, pills 9999px. Min mobile hit target 44px.

## Screens

### Mobile (402×874, dark)
1. **Home Feed** — Header: PNPTV+ wordmark left; right icon row (gap 12): search, message, notifications with magenta count badge ("3"), and a 32px circular profile avatar (magenta ring) that opens a **lateral menu**: 264px right-side drawer, slide-in .28s cubic-bezier(.2,.8,.2,1) with dim overlay; drawer holds user card (name, @handle, token balance) + items: My profile, My subscriptions, Buy tokens, Shop, Booked calls, Settings, Log out; footer "PNPtv v2.4 · Terms · Privacy". Body: story rail (58px avatars, magenta ring = live), "Spotlight" horizontal cards 132×176 with LIVE badge + name gradient scrim, then post cards (avatar, name+LIVE badge, @handle · time, caption, media slot h≈240, actions row Like/Comment/Tip).
2. **Live Directory** — "LIVE NOW" header + "· 48 live" amber counter; filter chips All (gradient active) / Hangouts / Solo / Couples / Groups; 2-col grid of live cards (LIVE badge, 👁 viewer count chip, name footer).
3. **Live Stream Player** — full-bleed video slot; top scrim header (34px avatar w/ ring, name, 👁 1,204 watching, LIVE badge, close); tip-goal bar under header ("🎯 Tip goal · Friday special", 2,450/5,000, 49% gradient fill); chat stack bottom-left (amber usernames; token tips get gradient bubble + amber outline); right rail ♥ 3.2k + gradient Tip button; bottom input "Say something…" + Send.
4. **Creator Profile** — cover slot h140, 78px avatar w/ magenta ring overlapping; name + ✓ badge, @handle · city; right side: "Hang with Nova" secondary button + "🔒 Paid members only" caption (private hangout is paid-member-gated); stats row Posts/Fans/Live avg; bio; action stack: primary lg "Subscribe · $15 Diamond 💎", two half-width secondary buttons "Book 30 min call" / "Book 60 min call", ghost "Channels"; tabs Posts · Media · User manual (active = magenta underline); 3-col square media grid.
5. **Direct Messages** — "MESSAGES" header + "+"; search input; conversation rows (avatar, name, preview, time, magenta unread count).
6. **Chat Thread** — header (back, avatar, name, "● online" amber, sparkle icon); bubbles: incoming surface-gray left, outgoing dark right; token-tip chip "🎁 25 tokens · sent"; input + Send.
7. **Subscribe / Tiers** — "SUBSCRIBE" header + close; creator row; tier cards Bronze $4.99/mo (secondary button) and Gold $14.99/mo "Best" (gradient card + "Choose Gold" primary); ✓ perk lists; footnote "Cancel anytime. Billed securely via crypto or card."
8. **Onboarding** — hero slot 52% height with bottom fade to bg + "PNPTV+" wordmark; progress dots (1 of 3, gradient active pill); h1 "Welcome to PNPtv"; sub copy; 3 feature bullets (🔴 go live, 💬 DM creators, 🪙 tip with tokens — 28px icon tiles); CTA stack: primary lg "Create account", ghost "I already have an account"; 18+ / Terms footnote.

**Bottom nav (all mobile screens):** Feed · Hangouts · Connect · Channels · Live. Active = magenta icon + white label; inactive gray. Active mapping: Home→Feed, Profile→Hangouts, DM/Chat→Connect, Live screens→Live.

### Desktop (1400×860, browser chrome)
9. **Web Home** (`app.pnptv.live/home`) — left sidebar nav, center post feed (cards like mobile), right "Live now" rail (avatar + viewer count + LIVE badge).
10. **Creator Studio — Go Live** (`studio.pnptv.live/go-live`) — camera preview panel (OFFLINE badge), stream settings form (title, category, tier gating), Go Live gradient CTA, right column session checklist/stats.
11. **Admin Console** (`app.pnptv.live/admin/overview`) — KPI stat cards, "Top creators" table (28px avatars, tier, fans, Verified/Pending badges).
12. **Shop + Buy Tokens** (`app.pnptv.live/shop`) — token packages (amber prices), merch grid (image, name, $24.00).

## Interactions & Behavior
- Lateral menu (screen 01): avatar click → overlay fade .25s + drawer slide .28s; overlay click closes.
- "Hang with Nova" (screen 04): opens the creator's private hangout; **only enabled for paid members** — gate on subscription state, otherwise show lock state/upsell to Subscribe.
- Book 30/60 min call buttons → booking flow (not mocked).
- Filter chips (screen 02): single-select, gradient = active.
- Tabs (screen 04): magenta underline slide.
- All media in the mockup uses fillable image placeholders — replace with real media/CDN images.

## State Management
- Auth/user: token balance, subscription tier per creator (gates Message/hangout + tier content).
- Live state: viewer counts, tip-goal progress (live updates via websocket).
- Chat/DM: unread counts, online presence.
- Drawer/menu open state, active nav tab.

## Assets
No binary assets — all imagery is placeholder slots. Fonts: "Ethnocentric Rg" (remote @import in ui-kit styles.css) and "Roboto Mono" (Google Fonts). Logo is styled text "PNPTV+" (magenta +).

## Files
- `PNPtv App Mockup.html` — canvas hosting all 12 frames (+ zoom bar, page-level image-slot styling)
- `shared.jsx` — PNP token map, Avatar, AppTopBar, BottomNav (nav items live here), IconBtn
- `screens-a.jsx` — HomeFeed (incl. lateral menu), LiveDirectory, LivePlayer, CreatorProfile
- `screens-b.jsx` — DMList, ChatThread, Subscribe, Onboarding
- `screens-c.jsx` — WebHome, CreatorStudio, AdminConsole, Shop
- `app.jsx` — mounts; `ios-frame.jsx` / `browser-window.jsx` — device chrome (reference only, don't implement)

## Suggested Claude Code prompt
> Read design_handoff_pnptv_app/README.md. Implement the mobile viewer screens in apps/web using @pnptv/ui-kit components and pnp-* Tailwind tokens, matching the JSX references screen by screen. Start with the Home Feed including the lateral profile drawer and the new bottom nav (Feed, Hangouts, Connect, Channels, Live).
