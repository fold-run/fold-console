# fold console

The read-only web console for [fold](https://github.com/fold-run/fold), the
enterprise MCP gateway: an observability dashboard over the gateway's
federation snapshot, plus an interactive MCP test console.

**This repo holds the source. It is not how you run the console.** The gateway
embeds these assets and serves them at `/console/` — turn them on with
`server.console.enabled` in your fold config. See
[fold's README](https://github.com/fold-run/fold#configuration).

## How this reaches a gateway

`fold-run/fold` vendors `console/` into its own `gateway/console/` at a pinned
commit and embeds it with `//go:embed`. The assets are checked in there rather
than fetched at build time because the Go module proxy is fold's distribution
channel: `go run github.com/fold-run/fold/cmd/fold@latest` builds from the
proxy zip alone, which runs no generators and carries no submodule content.

So a change here does not reach anyone until fold bumps its pin. That happens
either by hand (`make sync-console` there) or via fold's weekly `console-sync`
workflow, which opens a PR and never auto-merges — these assets execute in an
operator's browser next to a live Bearer token, so a bump is reviewed as a
supply-chain change.

## Compatibility

The console talks to gateway HTTP endpoints, so the two can skew. Match them:

| console | requires fold |
| --- | --- |
| `v1.0.0`+ | `v1.9.0`+ — `/api/federation`, `/api/auth-hint` |
| (pre-extraction) | `v1.2.0`–`v1.8.x` — `/console/api/state`, `/console/api/auth` |

## Developing

The console **must be same-origin with the gateway**. Its CSP is
`default-src 'self'` and fold sets no CORS headers, so serving these files from
a static server on another port will not work — the fetches are blocked.

The dev harness solves that with a reverse proxy: it serves `console/` at
`/console/` and forwards everything else to a local gateway.

```sh
# terminal 1 — a gateway with introspection and the console on
go run github.com/fold-run/fold/cmd/fold@latest --config fold.config.dev.json --port 8080

# terminal 2
go run ./dev            # http://localhost:5173/console/
```

Edit the files in `console/` and reload. There is no build step and no
dependency install.

## What the assets may not do

These constraints come from where the console runs, not from taste. CI enforces
the first two.

- **No external URLs.** The CSP admits this origin and — when sign-in is
  configured — exactly the OAuth issuer's origin. A CDN font, script, or image
  will silently fail to load in a shipped binary.
- **A bounded file set.** fold's sync copies an explicit allowlist and its test
  suite asserts the embedded file set exactly, so a new file here does not ship
  until fold's manifest is updated too. That is deliberate: adding to an
  operator's binary is a reviewed change on fold's side.
- **Static output only.** Whatever this is written in must compile to files
  that can be committed into fold. No SSR, no server runtime, no build-time
  fetch.
- **Treat all upstream strings as hostile.** Tool names, descriptions, and
  errors come from federated servers. Render with `textContent`, never
  `innerHTML`.

## License

Apache-2.0, matching fold.
