# gpxsnap (monorepo)

A dependency-free route-preview PNG renderer for Bun, plus the site that
presents it.

- **[`packages/gpxsnap`](packages/gpxsnap)** — the published library. GPX
  tracks (or plain coordinates) in, a static map PNG out. See its
  [README](packages/gpxsnap/README.md) for install/usage/API docs, or
  [npmjs.com/package/gpxsnap](https://www.npmjs.com/package/gpxsnap).
- **[`apps/website`](apps/website)** — the Astro site: presents the
  library and hosts an in-browser demo (renders a GPX file entirely
  client-side, no server involved).

## Development

This is a Bun workspace — one install at the root covers both packages.

```bash
bun install
bun test          # run tests across all packages
bun run typecheck  # tsc --noEmit, in every package that defines it
bun run lint       # oxlint
bun run fmt:check  # oxfmt --check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations. Report
security issues per [SECURITY.md](SECURITY.md) rather than in a public issue.

## License

MIT — see [LICENSE](LICENSE).
