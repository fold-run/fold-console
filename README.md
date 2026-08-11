# fold console

The read-only web console for [fold](https://github.com/fold-run/fold), the
enterprise MCP gateway: an observability dashboard over the gateway's
federation snapshot, plus an interactive MCP test console.

**This repo holds the source. It is not how you run the console.** The gateway
embeds these assets and serves them at `/console/` — turn them on with
`server.console.enabled` in your fold config. See
[fold's README](https://github.com/fold-run/fold#configuration).

## What it shows

| Route | |
| --- | --- |
| `#/` | Overview — the gateway's configuration, grouped: auth, federation, governance, tenancy, observability, discovery. |
| `#/upstreams` | Every federated upstream, filterable and sortable. Filter state is in the URL. |
| `#/upstreams/<id>` | One upstream in full: status, config, ownership, labels, per-endpoint health, raw record. |
| `#/catalog` | The tools, prompts and resources this principal can reach, searchable, with namespace attribution. |
| `#/test` | Invoke one of them and read the result, with the JSON-RPC wire log. |

Sign-in is OAuth 2.1 Authorization Code + PKCE against the issuer the gateway
names in `/api/auth-hint`, or paste a Bearer token. **The token lives in page
memory only** — never storage — so a reload signs you out. That is the trade for
a credential that opens the whole federation.

## Stack

TypeScript, Preact (via `preact/compat`), [TanStack
Router](https://tanstack.com/router) and [TanStack
Query](https://tanstack.com/query), built with Vite.

Routing is on the **fragment** (`/console/#/upstreams`), not the path. That is a
deployment constraint, not a preference: fold serves these assets from an
`http.FileServer` over an embedded FS, so there is no SPA fallback and
`GET /console/upstreams` is a 404 in every shipped binary — which this repo
cannot fix, because the server lives in another repo behind a reviewed
vendoring step. Hash routing makes every deep link a request for `/console/`,
which the file server already answers. It also keeps the OAuth `redirect_uri` to
a single registerable value.

Preact rather than React because the whole bundle ships inside every fold
binary and `react-dom` is most of a font's worth of bytes on its own. See the
budget in `.github/workflows/ci.yml`.

## How this reaches a gateway

`fold-run/fold` vendors `dist/` into its own `gateway/console/` at a pinned
commit and embeds it with `//go:embed`. The assets are checked in there rather
than fetched at build time because the Go module proxy is fold's distribution
channel: `go run github.com/fold-run/fold/cmd/fold@latest` builds from the proxy
zip alone, which runs no generators and carries no submodule content.

**`dist/` in this repo is build output, and it is committed** for the same
reason — it is the one directory here that `.gitignore` deliberately does not
ignore. `pnpm build` writes it; CI rebuilds and fails on any diff, so what fold
vendors always corresponds to the source beside it. Nothing in `dist/` is
hand-written, and a change there is only ever reviewed as the shadow of a
change in `src/`.

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

Skew is handled rather than assumed away: `src/lib/version.ts` gates each
gateway-dependent surface on the version that introduced it, and a gateway
older than the minimum says so in a banner. A feature the gateway is too old
for is *absent*, never broken.

## Developing

```sh
pnpm install

# terminal 1 — a gateway with introspection and the console on
go run github.com/fold-run/fold/cmd/fold@latest --config fold.config.dev.json --port 8080

# terminal 2
pnpm dev          # http://localhost:5173/console/  — HMR
pnpm build && pnpm preview   # the same URL, serving the real bundle
```

The console **must be same-origin with the gateway**: its CSP is
`default-src 'self'` and fold sets no CORS headers, so serving these files from
a static server on another port has every fetch blocked. Both Vite servers here
proxy `/api`, `/mcp` and `/health` to the gateway (`FOLD_GATEWAY` to point
elsewhere) and mount the app at `/console/`, so the one path shape this console
cannot get wrong — `../api/…` resolving under a proxy prefix — is exercised
from the first keystroke.

`pnpm preview` is the one that replays fold's exact response headers, including
the CSP. Use it before opening a PR: Vite's dev server injects an inline script
for hot reload, so the strict policy can only be honest about built output.

> This replaces the Go reverse proxy this repo used to carry (`go run ./dev`).
> It existed only to provide that single origin, and a whole Go module for one
> reverse proxy stopped paying for itself once a build step arrived with a dev
> server that proxies. The header replay — the part that actually caught
> regressions — moved into `vite.config.ts`.

`pnpm typecheck` and `pnpm lint` are what CI runs.

## What the assets may not do

These constraints come from where the console runs, not from taste. CI enforces
all of them.

- **No external URLs.** The CSP admits this origin and — when sign-in is
  configured — exactly the OAuth issuer's origin. A CDN font, script, or image
  will silently fail to load in a shipped binary.
- **No inline `<script>` and no `style` attributes.** `default-src 'self'`
  grants no `'unsafe-inline'`, so both are dropped by the browser. This is why
  Vite's module-preload polyfill is off and why `style={{…}}` is a lint error —
  use a class.
- **A bounded file set.** fold's sync copies an explicit allowlist and its test
  suite asserts the embedded file set exactly, so the build pins its output
  filenames (`app.js`, `style.css`, one chunk, unhashed fonts). A new file here
  does not ship until fold's manifest is updated too. That is deliberate:
  adding to an operator's binary is a reviewed change on fold's side.
- **A byte budget.** These assets are on every operator's disk. The ceiling is
  in CI; raise it in a commit that says why.
- **Static output only.** Whatever this is written in must compile to files that
  can be committed into fold. No SSR, no server runtime, no build-time fetch.
- **Treat all upstream strings as hostile.** Tool names, descriptions, and
  errors come from federated servers. JSX escapes text children; there is no
  `innerHTML` and no `dangerouslySetInnerHTML` in this repo, and CI fails the
  build if one appears.

## Notes

- [`docs/design.md`](docs/design.md) — why the console is shaped this way: the
  decisions behind the rewrite, what was deliberately left out, and what is
  still open.
- [`docs/fold-sync-console.patch`](docs/fold-sync-console.patch) — the
  companion change to `fold-run/fold`, which must land together with the commit
  that renamed this repo's output directory from `console/` to `dist/`.

## License

Apache-2.0, matching fold.
