# Why the console is shaped this way

Notes on the decisions behind the rewrite, so the next person does not have to
re-derive them from a diff.

## It is a read-only console, and that is the constraint everything follows from

fold has no write API. Its configuration is a file, reconciled by whatever the
operator already uses for config. So this is not a management UI with the edit
buttons removed — there is nothing to submit, and every affordance that exists
to *change* something would be dead weight.

What is left is the harder and more interesting problem: showing an operator a
running system well enough that they can act on it somewhere else. Everything
below is in service of that.

## The shell, and why it came first

The old console was one scrolling page. That is why everything on it had to be
visible at once, why the upstream table had to cram endpoints, labels, owner and
error text into cells you could only read by scrolling sideways, and why there
was exactly one URL to send anybody.

A persistent sidebar over a routed content area is the piece that makes a second
view possible. Nearly every other decision here depends on it:

- **Deep-linkable state.** Filters, sort, the selected capability, the selected
  tool — all in the URL. "The broken upstream" becomes something you paste into
  a chat rather than describe. This is the single biggest usability difference
  from the old page.
- **A detail route per upstream** (`#/upstreams/<id>`) — a stable URL for one
  thing, with room to show all of it, including fields the list never had space
  for (`owner.contact` was in fold's API and had never been rendered).
- **A searchable catalog.** Tools, prompts and resources used to live in a
  `<select>`. A dropdown is a fine control for ten things and a wall for the
  several hundred a real federation exposes: no search, no description without
  selecting, no way to tell which upstream a name came from.

## Filtering is local, and it is allowed to be good

A management UI pages and filters against the server, and usually has to settle
for exact-match to do it. `/api/federation` hands over the whole federation in
one snapshot, so sorting and filtering here are local, instant, and substring —
no cursor, no request per keystroke. This is a case where fold's API shape makes
the better UX the cheaper one.

## Skew is designed for, not assumed away

This console and the gateway ship separately: fold vendors these assets at a
pinned commit and bumps that pin on its own schedule. An operator can be running
a console built against endpoints their gateway does not have.

`src/lib/version.ts` gates each gateway-dependent surface on the version that
introduced it. The rule is: **a feature the gateway is too old for is absent,
never broken.** Absence is a card that does not render. Only a gateway below the
minimum earns a banner, because that is the only case where the operator cannot
get their job done.

The same instinct drives the raw-record pane on the upstream detail page: this
console will always lag the gateway by a field or two, and nobody should have to
curl the API to see one the page has not learned to render.

## Cheap affordances that pay for themselves

- **Copy buttons on every identifier.** An operator reading this is on their way
  to a terminal. Making them select monospace text out of a table is the
  difference between the console being useful and being a screenshot.
- **Toasts for events, banners for conditions.** A toast reports something that
  happened and leaves. A banner describes a state that persists until it
  resolves, and is the only thing here with `role="alert"`.
- **Every list has a defined empty state.** "No results" makes the operator
  guess whether they are looking at a filter, a permission, or an outage — the
  three states fold can actually be in, which are otherwise indistinguishable.
- **Argument skeletons from `inputSchema`.** A management UI would render a real
  form from a tool's schema. With no write API to submit one to, the read-only
  equivalent is to hand the operator a filled-in shape to edit. Required
  properties only; a skeleton carrying every optional field is noise.
- **Docs links straight to the relevant section**, anchored where the page is
  broad and the question is narrow. These were *versioned* first —
  `docs.fold.run/1.10/configuration/` — on the reasoning that the docs opened
  from a running gateway should match that gateway. It is a good idea borrowed
  from tools whose docs are published per release. fold's are one unversioned
  site, so every link 404'd, and three topic slugs did not exist under any
  prefix. Nothing in the repo could have caught it: external navigations are
  invisible to the CSP and to any test that does not leave the machine.
  `tests/docs-links.spec.ts` now fetches every URL the console can emit.

## The fonts were shipping twice

Worth recording, because nothing about it was visible and the fix inverted the
expected trade. The four woff2 files had the `-400` and `-600` of each family
byte-identical: both were the *variable* font, wght axis intact, defaulting to
400, declared in CSS as two static faces. A face declared `font-weight: 600`
whose file carries no 600 instance renders the outlines it has, so nothing on
the page was ever bold — and the payload was doubled to achieve that.

The obvious fix — ship each variable font once and declare a weight range — is
wrong twice over. It is *larger* (63 KB against 55 KB, because variation deltas
cost more than a second instanced outline set when only two weights are used),
and it changes the shipped file set, which fold pins and asserts. Instancing to
four static subsets keeps fold's manifest untouched and gives back 71 KiB —
more than the entire framework had cost, which is why the byte budget went back
to the number it had before the rewrite.

### Where the fonts come from

`fonts-src/sources.json` pins the upstream release each face is cut from, by
tag and by sha256, and `scripts/subset-fonts.py` refuses to build from a
download that does not match. Before that the directory held the
previously-shipped subsets, which made the provenance circular: the source of
the bytes was the bytes, and nobody could verify that what a fold binary embeds
is really IBM Plex Sans and Geist Mono — in a repo whose whole vendoring
discipline exists to make that kind of question answerable.

Both projects ship designed weights next to their variable fonts, so the script
takes Regular and SemiBold directly rather than instancing an axis. That is the
weight their type designers drew, and one less transformation between upstream
and an operator's screen.

Three things fell out of doing it properly:

- **Smaller, not larger.** 47 KiB against 55 KiB, because the subsetter now
  runs with the same settings the previously-shipped files were built with:
  the standard webfont feature set rather than every feature (which retains
  stylistic alternates nothing here asks for), and unhinted, which is what
  those files always were and what Google Fonts serves for latin.
- **The arrows are ours now.** The Google latin range carries `U+2191` and
  `U+2193` but not `U+2190`/`U+2192` — and the console renders `→` in every
  docs link and `←` on the back link, and prefixes *every line of the wire
  log* with one. They had been coming from whatever the system fell back to,
  which in a monospace pane means an arrow that does not match the column it
  starts. The range is widened to `U+2190-2193`.
- **The licence rides inside the file.** The name records are pinned to keep
  IDs 13 and 14, which fontTools' default drops, so the OFL text is in the
  font as well as in `fonts/OFL.txt`.

CI asserts no two shipped font files are identical, since nothing catches that
by eye: the page renders, it just renders wrong.

## Where the design system lives

`fold.run`'s `DESIGN.md` / `DESIGN.json` is canonical: the colour roles, the one
2px radius, the Live-is-proof rule and the wordmark all originate there, and
`src/styles/app.css` restates the tokens because the console cannot import
across repos. There is deliberately no `DESIGN.md` in this repo. A second copy
of the system is a second thing to drift, and it already has: the console
shipped the pre-2026-08-10 stroked mark for a while under a stylesheet header
claiming to follow that revision. The wordmark now matches, and the colour
tokens were checked against `DESIGN.json` at the same time.

The one thing this console defines for itself is density. Marketing surfaces
set controls at 44px; this one runs at 34px because it stacks a filter row, a
picker and a table on a laptop, and comfortable spacing would push the
federation below the fold. Small controls compensate with pointer targets
larger than their boxes rather than by growing.

## Deliberately not done

- **A component library or design system.** fold's tokens already live in
  `src/styles/app.css`, and any off-the-shelf library is several times the byte
  budget these assets get inside a fold binary.
- **A runtime i18n library.** Machinery without a consumer for a single-locale
  operator console. Strings live at their use site until there is a second
  locale.
- **An embedded code editor.** Monaco alone is roughly twenty times the whole
  budget. What anyone actually wanted from it was to copy the payload, which is
  one button.
- **Runtime config injection.** Some gateway UIs need to be told where their API
  is, because the two are on different origins. fold serves the console
  same-origin; `../api/…` is the entire configuration story, and it survives
  proxy prefixes, which an injected absolute URL would not.
- **Telemetry.** The CSP forbids it and so does the threat model.

## The tests

`tests/` drives the built bundle through `pnpm preview`, which is the server
that replays fold's exact response headers. Three things follow from that
choice and are worth stating, because they are what the suite is *for*:

- **The CSP is exercised, not reasoned about.** One test walks the whole app
  and asserts no `securitypolicyviolation` fired. CI's greps catch an inline
  `<script>` in the HTML and a `style={{}}` in the source; neither would notice
  a dependency injecting a style tag at runtime.
- **The untrusted-string invariant is tested with actual payloads.** A
  federated tool named `<img src=x onerror=...>`, an upstream error, a label, a
  tool result — each asserted to render as text and to leave no element and no
  side effect behind. That is the invariant that matters most here: these pages
  render attacker-influenced strings on the gateway's own origin, next to a
  live Bearer token.
- **The gateway is mocked, deliberately and with a known cost.** It buys the
  states a real gateway will not produce on demand — 401, 403, version skew, an
  empty federation, an open breaker, a server answering method-not-found. It
  cannot buy contract fidelity, which is what `tests/contract.spec.ts` is for.

### The accessibility suite

`tests/a11y.spec.ts` runs axe over every route and over the states that only
exist after an interaction: a connected catalog, the test console with a result
and a wire log, an unauthorized gateway with its banner, and the skip control
while focused.

It is not a replacement for judgement — axe cannot tell whether an
announcement is useful or whether "not updating" is the right phrase — but the
accessibility work here was done by hand and verified by reading, which checks
only the things the author thought of. It found one:

**Links inside prose were distinguished from the text around them by colour
alone.** A Carrier link in a paragraph of Static text is a 1.4:1 difference,
which fails WCAG 1.4.1. fold.run already underlines links inside `main p` and
`.lede`; the console had dropped the rule. Standalone links — nav, footer, card
actions, table cells — keep the clean treatment, because position makes them
unambiguous.

One thing the suite has to work around: scanning mid-animation measures a
composited colour. axe reported the Down banner at `#bf3c5d`, which is
`#FF4C79` part-way through its 180ms entrance, not a contrast failure. The scan
waits for finite animations to finish, filtering out the freshness dot's
infinite pulse, which would never resolve.

### The contract suite

`src/lib/federation.ts` is a hand transcription of fold's `introspection.go`,
and for a while nothing checked it. A renamed field would have left fold's
tests green, this repo's tests green, and operators looking at blank cards —
the exact skew `src/lib/version.ts` exists to survive, and the one path with no
test at all.

`pnpm test:contract` measures a live gateway against `src/lib/contract.ts`,
which states the field list once. The `satisfies Record<keyof T, …>` clause
means the list cannot drift from the interface: add, remove or rename a key on
the type and tsc fails. What the runtime check adds is the kinds, and whether
fold still sends what the console reads.

It runs only when `FOLD_GATEWAY_URL` is set, so a laptop needs no Go. CI
supplies it from the **published release artifact** rather than `go install`:
goreleaser sets the version with ldflags, so a module-proxy build reports
`dev`, and testing that would test a binary no operator on a release runs.

The pin is deliberate and mirrors fold pinning this repo by commit — a pull
request tests the release this console is built for, and a weekly run tests
`@latest` as early warning.

It earned itself immediately: every fixture in this repo modelled `version` as
`1.9.0`, and a real gateway serves `v1.9.0`. Harmless, because
`src/lib/version.ts` parses both, but it meant the whole suite was exercising a
string fold does not emit.

The suite paid for itself on the first run: it found that the Bearer-token
field never applied its value. preact/compat aliases React's `onChange` onto
the input event, so declaring both `onInput` and `onChange` left one handler
clobbering the other — keystrokes were swallowed and a pasted token
authenticated nothing. Nothing in the browser looked wrong, and every static
check passed.

## The polish pass

Three of these were real bugs rather than refinements, and all three were
invisible to every static check:

- **A bare `header` selector.** The app bar's styles matched every page's
  `<header class="page-head">` too, handing each one 1.5rem of side padding. Every
  h1 in the console sat 24px right of the content beneath it.
- **A grid absorbing flex slack.** `.body` grows to fill the viewport, and a grid
  hands that slack to its rows. Once the sidebar stacked above the content on
  narrow screens, its row swallowed ~140px and opened a hole between the nav and
  the page title.
- **The wire log stopped following.** Auto-scroll was lost in the rewrite. The
  fix has its own trap: "is the operator at the tail" cannot be measured after
  the content grows, because by then they measure as scrolled away by exactly
  the height of the message that just arrived. Intent is tracked from scroll
  events instead.

Added, in the same pass: a freshness indicator in the top bar (a snapshot that
does not say how old it is is a screenshot, not evidence), skeletons shaped like
the content, a skip link, route announcements, hit areas ≥44px on the two
controls too small to hit, and progressive disclosure on the test console, which
used to announce "not connected" and then render the whole form disabled.

Motion earns its place only where it conveys state: a toast arriving, a banner
appearing, the polling dot pulsing. Everything else is still.

## The topology view

`/upstreams?view=map` draws the federation in fold's fold-line vocabulary
(`DESIGN.md` §5): dashed fold-lines on the fold-line grey, nodes on Rack with
Trace strokes, the gateway stroked in Live and carrying the wordmark rather
than a label, notch marks at the governed boundary, and a Live grain arrow on
each route that is carrying.

It departs from fold.run in exactly one way, and has to: every diagram on the
site is hand-authored, and this one cannot be, because nobody knows the shape
of an operator's federation in advance. So the vocabulary is a generator.

**It earns its place by saying two things a table cannot.** The fan — one
endpoint in front of N servers is fold's whole proposition, and rows do not
show it. And the boundary — every route crosses the same notched seam, which is
where auth, policy and audit happen; a row cannot draw something true of all
rows at once. Everything else stays in the table, which is why each node is a
link into the detail route rather than a tooltip.

It is a view on `/upstreams` rather than its own route so that both
representations share one filtered set, one empty state and one loading state.
Filtering to `status=disconnected` and switching to the map is the move it
exists for.

Route treatment is the health readout: Live for connected with the breaker
closed, Down for failed, the neutral ramp for half-open, which is neither
proven nor failed. An upstream reporting no breaker at all reads as connected —
absence is version skew, not a state.

Beyond 40 upstreams the fan stops being a shape and becomes a texture, so the
drawing caps there and the caption names the remainder. It is never silently
truncated.

## Still open

- **Persisted view preferences.** Everything is in the URL instead, which is
  better for sharing and worse for "the way I always look at this".
