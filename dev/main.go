// Command dev serves the console against a locally running fold gateway.
//
// The console must be same-origin with the gateway: its CSP is
// `default-src 'self'` and fold sets no CORS headers, so a plain static server
// on another port has every fetch blocked. This proxy provides the single
// origin — static files under /console/, everything else (/api/federation,
// /api/auth-hint, /mcp) forwarded to the gateway.
//
// It lives here rather than as a --console-dir flag in fold because that flag
// would be a production-reachable knob serving arbitrary disk contents under
// /console/. Dev-only code belongs in the dev-only repo.
//
//	go run ./dev            # http://localhost:5173/console/
package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
)

// Kept byte-identical to consoleCSP's base policy in fold
// (gateway/console.go). If they drift, this harness hides CSP regressions
// instead of surfacing them — which is the one job it must not fail at. The
// issuer origin fold appends for OAuth is omitted: sign-in against a real IdP
// is not something this harness sets up.
const csp = "default-src 'self'; connect-src 'self'" +
	"; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

func main() {
	addr := flag.String("addr", "127.0.0.1:5173", "address to listen on")
	target := flag.String("gateway", "http://127.0.0.1:8080", "fold gateway to proxy to")
	dir := flag.String("dir", "", "console asset directory (default: ../console relative to this file's module root)")
	flag.Parse()

	root := *dir
	if root == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatal(err)
		}
		root = filepath.Join(wd, "console")
	}
	if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
		log.Fatalf("no console/index.html under %s — run this from the repo root, or pass --dir", root)
	}

	gw, err := url.Parse(*target)
	if err != nil {
		log.Fatalf("bad --gateway: %v", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(gw)

	files := http.StripPrefix("/console/", http.FileServer(http.Dir(root)))
	mux := http.NewServeMux()
	mux.Handle("/console/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Same headers fold serves, so what you test here is what ships.
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		files.ServeHTTP(w, r)
	}))
	mux.Handle("/console", http.RedirectHandler("/console/", http.StatusMovedPermanently))
	// Everything else is the gateway's: /api/federation, /api/auth-hint, /mcp,
	// /health. Host is left alone — fold validates it, and rewriting it to
	// something exotic would trip the allowlist.
	mux.Handle("/", proxy)

	log.Printf("console  http://%s/console/", *addr)
	log.Printf("gateway  %s", gw)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
