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
- **Version-aware docs links.** The docs an operator opens from a running
  gateway should be the docs for *that* gateway.

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

`scripts/subset-fonts.py` regenerates them from `fonts-src/`. CI asserts no two
shipped font files are identical, since nothing catches that by eye: the page
renders, it just renders wrong.

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
  does not buy contract fidelity; `tests/gateway.ts` says so at the top and
  names what covers that instead.

The suite paid for itself on the first run: it found that the Bearer-token
field never applied its value. preact/compat aliases React's `onChange` onto
the input event, so declaring both `onInput` and `onChange` left one handler
clobbering the other — keystrokes were swallowed and a pasted token
authenticated nothing. Nothing in the browser looked wrong, and every static
check passed.

## Still open

- **Persisted view preferences.** Everything is in the URL instead, which is
  better for sharing and worse for "the way I always look at this".
- **A federation topology view.** fold's data would support one — namespaces,
  endpoints, breaker state — and it is the one view that would say something a
  table cannot.
