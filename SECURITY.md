# Security Policy

## Supported Versions

gpxsnap is pre-1.0-stable tooling; only the latest published version on npm
receives fixes.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, use GitHub's [private vulnerability reporting](https://github.com/Slashgear/gpxsnap/security/advisories/new)
(Security tab → "Report a vulnerability"). This opens a private advisory
visible only to the maintainer until a fix is ready.

If that isn't available, contact [@Slashgear](https://github.com/Slashgear)
directly on GitHub.

Given the project's scope — a PNG codec parsing bytes from XYZ tile servers,
and a small regex-based GPX/XML extractor parsing untrusted file contents —
reports about malformed input causing crashes, hangs, or memory issues in
either the PNG decoder (`src/png/decode.ts`) or the GPX parser (`src/gpx.ts`)
are especially welcome.

## What to Expect

- Acknowledgement within a few days.
- A fix or mitigation plan once the report is confirmed.
- Credit in the release notes, unless you'd prefer to stay anonymous.
