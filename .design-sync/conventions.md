## Setup

No provider or root wrapper is required — components read only Tailwind
utility classes and CSS custom properties, both already resolved with literal
fallback values in `styles.css`. Just import `styles.css` once and use the
components directly.

The kit is dark-themed by default (`--pnp-background: #121212`). To support a
light theme, set `data-theme="light"` on `<html>` — the shipped stylesheet
already defines the override block; there is nothing to wire up in JS.

## Styling idiom: Tailwind, `pnp`-prefixed tokens

Style with Tailwind utility classes, never inline hex colors. The `pnp` color
family (defined in `theme.ts`, resolved via CSS vars):

| Class | Token | Notes |
|---|---|---|
| `bg-pnp-background` / `text-pnp-background` | `--pnp-background` | page background, theme-aware |
| `bg-pnp-surface` | `--pnp-surface` | card/input surface, theme-aware |
| `bg-pnp-surfaceHover` | `--pnp-surface-hover` | hover state for surfaces |
| `text-pnp-textPrimary` | `--pnp-text-primary` | primary text, theme-aware |
| `text-pnp-textSecondary` | `--pnp-text-secondary` | secondary/muted text, theme-aware |
| `border-pnp-border` | `--pnp-border` | default border color, theme-aware |
| `bg-pnp-accent` / `bg-pnp-accentHover` | literal `#D4007A` / `#E6198E` | brand magenta, fixed in both themes |
| `bg-pnp-error` / `bg-pnp-warning` / `bg-pnp-success` | literal hex | status colors, fixed |
| `bg-pnp-amber` / `bg-pnp-lemon` / `bg-pnp-purple` | literal hex | secondary brand accents, fixed |

Two hand-authored utility classes carry brand motion/gradient and are NOT
reproducible with plain Tailwind classes — use them verbatim:

- `.btn-gradient` — magenta→amber gradient with a hover lift + shadow. This is
  what `Button`'s `primary` variant uses; reach for it directly if composing a
  gradient CTA that isn't the `Button` component.
- `.badge-gradient` / `.badge-gradient-text` — the paired background +
  gradient-clipped text classes `Badge`'s `success`/`accent` variants use.

**Headings get the display font automatically — do not add a font class.**
`h1`, `h2`, `h3` elements are styled with the "Ethnocentric Rg" display font
by a bare element selector, not a `font-*` utility (`font-display` is
configured in the Tailwind preset but unused anywhere in the product, so it
never made it into the compiled CSS this kit ships — it will not resolve).
Use a real heading tag for anything meant to read as a title (as `Card` and
`Modal`'s `title` prop already do); body copy defaults to "Roboto Mono" via
`font-mono` / `font-sans` (same family, both aliases resolve identically).

Both fonts load from a remote host at runtime (`@import` in `styles.css` for
"Ethnocentric Rg"; a Google Fonts `@import` for "Roboto Mono") — nothing to
self-host.

## Where the truth lives

- `styles.css` — import closure entry point; pulls in tokens, the two remote
  font `@import`s, and `_ds_bundle.css` (the kit's real compiled styles,
  scraped from the product app's own Tailwind build — not hand-rolled).
- `components/<group>/<Name>/<Name>.prompt.md` — per-component API + usage.

## Example: composing a real card

```tsx
import { Card, Badge } from '@pnptv/ui-kit';

function CreatorSpotlight() {
  return (
    <Card hover onClick={() => {}}>
      <div className="flex items-center justify-between">
        <h3 className="text-pnp-textPrimary">Creator Spotlight</h3>
        <Badge variant="accent">LIVE</Badge>
      </div>
      <p className="text-pnp-textSecondary text-sm mt-2">
        Tap to view the full profile.
      </p>
    </Card>
  );
}
```
