# Security Policy

## Reporting a Vulnerability

Email **support@pnptv.app** with details. Do not open a public GitHub issue.

## Dismissed Dependabot Alerts

Advisories the maintainers have reviewed and dismissed with explanation. If you
open a new Dependabot alert that matches one of these, dismiss it with the same
rationale rather than filing an issue.

### GHSA-qwww-vcr4-c8h2 — React Router RSC Mode CSRF Bypass

- **Package:** `react-router` (via `react-router-dom`)
- **Severity:** High
- **Status:** Not applicable — dismissed as "Vulnerable code is not actually used"
- **Rationale:** This application is a Vite SPA. We do not use React Router's
  unstable RSC APIs (`react-router/rsc`, `createStaticHandler`,
  `createStaticRouter`, framework mode, or any server-side action handlers).
  The advisory explicitly states: *"This only affects your application if you
  are using the unstable RSC APIs."*
- **Revisit when:** `react-router-dom@8.3+` is released and available as a
  routine dependency bump. Until then, the vulnerable code path exists in the
  installed version but is unreachable from our codebase.
