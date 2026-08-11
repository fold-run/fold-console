// The build exists to produce exactly the file set fold vendors — nothing more.
//
// `dist/` is BUILD OUTPUT and is committed, because fold vendors it: its
// scripts/sync-console.sh copies an explicit manifest out of this directory
// (index.html, app.js, style.css, fonts/*) into gateway/console/, and its test
// suite asserts the embedded file set exactly. So every knob below that pins a
// filename or suppresses a chunk is load-bearing: a hashed name or a second
// chunk does not ship, it fails fold's sync.
//
// Note that `dist` names the directory, not the URL. fold serves the page at
// /console/ regardless, which is why `base` below still says /console/.
//
// Three consequences of the shipped CSP (`default-src 'self'`) also shape this
// config: no inline <script>, so Vite's module-preload polyfill is off; no
// external origins, so nothing may be fetched from a CDN; and relative asset
// URLs, because the page is served under /console/ and may sit behind a proxy
// that adds a further prefix.
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import preact from '@preact/preset-vite'
import { fileURLToPath } from 'node:url'

// Kept byte-identical to consoleCSP's base policy in fold (gateway/console.go).
// If they drift, this harness hides CSP regressions instead of surfacing them
// — which is the one job it must not fail at. The issuer origin fold appends
// for OAuth is omitted: signing in against a real IdP is not something this
// harness sets up.
const FOLD_CSP =
  "default-src 'self'; connect-src 'self'" +
  "; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

const GATEWAY = process.env.FOLD_GATEWAY ?? 'http://127.0.0.1:8080'

/**
 * Serve the built bundle the way fold serves it.
 *
 * This replaces the Go reverse proxy this repo used to carry (`go run ./dev`).
 * That harness existed for one reason — the console must be same-origin with
 * the gateway, because its CSP is `default-src 'self'` and fold sets no CORS
 * headers — and a whole Go module for one reverse proxy stopped paying for
 * itself the moment a build step arrived with a dev server that proxies.
 *
 * What the Go harness did that a bare `vite preview` does not, and what this
 * plugin keeps: mount at /console/ so the page's "../api/…" fetches resolve
 * the way they will in production, and reply with fold's exact security
 * headers so a CSP regression fails here rather than in a shipped binary.
 *
 * It runs against the *built* output on purpose. Vite's dev server injects an
 * inline script for hot reload, which `default-src 'self'` forbids — so the
 * strict policy can only be honest about output that has no dev tooling in it.
 */
function foldPreview(): Plugin {
  return {
    name: 'fold-preview',
    configurePreviewServer(server: PreviewServer) {
      // `base` already mounts the bundle at /console/; all this adds is the
      // response headers fold sends, which is the whole point of the harness.
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', FOLD_CSP)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'no-referrer')
        next()
      })
    },
    configureServer(server: ViteDevServer) {
      // Dev is mounted at /console/ too (see `base`), so the one path shape
      // this console cannot get wrong is exercised from the first keystroke.
      server.middlewares.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'no-referrer')
        next()
      })
    },
  }
}

const proxy = {
  '/api': GATEWAY,
  '/mcp': GATEWAY,
  '/health': GATEWAY,
}

export default defineConfig(({ command }) => ({
  // Build: relative, so /console/ and /any-proxy-prefix/console/ both resolve.
  // Dev/preview: the real mount point, so "../api/…" resolves to /api/… here
  // exactly as it will in a shipped binary.
  base: command === 'build' ? './' : '/console/',
  plugins: [preact(), foldPreview()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // dist/ holds the committed output plus public/ copies; a clean build is
    // what makes `git diff --exit-code` in CI a meaningful check.
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    // Vite's default preload polyfill is an inline <script>, which
    // `default-src 'self'` blocks outright. Static <link rel="modulepreload">
    // is fine, and with a single chunk there is nothing to preload anyway.
    modulePreload: { polyfill: false },
    // Fonts and anything else stay as files. An inlined data: URI would change
    // the emitted file set fold pins.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // One chunk. fold's manifest names app.js; a second chunk would be a
        // file that never reaches an operator's binary and 404s at runtime.
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: (asset) =>
          asset.names?.[0]?.endsWith('.css') ? 'style.css' : 'fonts/[name][extname]',
      },
      // TanStack Router probes for React 19's `use` with a dynamic lookup
      // (`React['use']`) and guards every call site on it; preact/compat has
      // no such export, which is exactly the React 18 path it falls back to.
      // Rollup reports the missing name anyway. Silenced here so that a *real*
      // missing export — the kind that breaks a shipped binary — is not one
      // line of noise among two.
      onLog(level, log, handler) {
        if (log.message.includes('"use" is not exported')) return
        handler(level, log)
      },
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
}))
