# Fonts

The intro uses two faces:

| Role | Face | Source |
|---|---|---|
| Display — title, disclaimer heading, clause numbers | **Ethnocentric** | `fonts.cdnfonts.com` |
| Body — everything else | **Roboto Mono** 400/500/600/700 | Google Fonts |

## The Ethnocentric problem

The design prototype loaded Ethnocentric from `https://fonts.cdnfonts.com/css/ethnocentric`. That creates two failure modes for a render pipeline:

1. **Network egress.** This container's network policy does not allowlist `fonts.cdnfonts.com` — requests return `403 Host not in allowlist`. Every render here falls back to Roboto Mono for the display face. `render-intro.mjs` checks `document.fonts.check()` after load and prints a warning when the face is missing, so a fallback render is never silent.
2. **Non-determinism.** Even where the host is reachable, a third-party CDN in the render path means an intro's typography depends on someone else's uptime.

## Making it deterministic

Drop a licensed `woff2` at `public/fonts/ethnocentric.woff2`. The `@font-face` rule already in `index.html` points there and takes precedence over the CDN stylesheet:

```
public/fonts/ethnocentric.woff2
```

Rebuild (`npm run build`) and the font is served from the same origin as the page. No code change needed.

Until you do, the browser logs a 404 for `fonts/ethnocentric.woff2` on every load. That is the fallback working as designed, not a build error.

Ethnocentric is a commercial typeface (Larabie / Typodermic). Self-hosting it requires a webfont licence that permits it — confirm your licence before vendoring the file.

## Allowlisting the CDN instead

If you would rather keep the CDN, add `fonts.cdnfonts.com` to your Claude Code environment's network egress settings. See <https://code.claude.com/docs/en/claude-code-on-the-web>. This fixes rendering in web sessions but leaves the render dependent on a third party.

## Falling back on purpose

If you decide not to license Ethnocentric, edit `FONT_DISPLAY` in `src/intro/theme.ts`:

```ts
export const FONT_DISPLAY = "'Roboto Mono',monospace";
```

The layout is unaffected — only the letterforms of the title and headings change. This is what every render in this container currently produces.
