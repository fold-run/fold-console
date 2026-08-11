# Product

## Register

product

## Users

Platform and infrastructure operators running fold, an enterprise MCP gateway,
inside their own network. They arrive here from an alert, a ticket, or a
colleague's question, on a laptop, usually with a terminal already open beside
the browser. The console is never the destination: it is the place they confirm
what the gateway believes, then go act somewhere else.

Three jobs, in rough order of frequency:

1. **"Is the federation healthy, and if not which upstream?"** Read the
   snapshot, find the one that is down, get its owner and its error.
2. **"What is this gateway actually configured to do?"** Auth, policy, rate
   limits, tenancy, audit, discovery — answered without reading a config file
   they may not have access to.
3. **"Does this tool work through the gateway?"** Invoke it as a real client
   would, with policy, rate limits and audit applying exactly as they do to
   anyone else, and read the wire log.

A second, quieter user: a tenant with a scoped view, checking what their own
tenant is allowed and which upstreams they can reach.

## Product Purpose

A read-only observability surface over the gateway's federation snapshot, plus
an MCP test console. It exists so that "what is the gateway doing right now"
has an answer that does not require shell access to the host.

It has no write API and never will; fold's configuration is a file, reconciled
by whatever the operator already uses. Success is an operator getting their
answer in under thirty seconds and leaving. Time-on-page is not a goal.

The console ships embedded in every fold binary, which shapes everything: a hard
byte budget, a strict same-origin CSP, and a page that renders strings supplied
by federated servers the gateway does not control, next to a Bearer token held
in memory.

## Brand Personality

**Machined, evidential, quiet.**

The voice states what is true and what to do about it, in the fewest words that
survive being read at 2am. It never reassures, never congratulates, and never
pads. Error text names the config key the operator must change.

The visual language follows fold's own system: one radius, a neutral ramp, and
colour reserved for meaning. Live (the acid yellow) is licensed to proof —
status-up and the focus ring — and nothing else. An interface that spent it on
a button would be lying about what colour means here.

## Anti-references

- **The observability dashboard as cockpit.** Grafana-style walls of gauges,
  sparklines and hero metrics. This console shows a snapshot, not a time series;
  a big number with a trend arrow would be inventing data fold does not have.
- **The SaaS admin panel.** Rounded cards on a light gray page, an illustrated
  empty state, a "You're all set!" toast. Wrong register and wrong voice.
- **Colour as decoration.** Status pills in six hues, gradient headers, a
  coloured accent per section. Every hue here must mean something.
- **The reassuring product.** Copy that congratulates the operator, hides an
  error behind "Something went wrong", or emits a spinner where it could show
  what it already knows.

## Design Principles

1. **Absence over placeholder.** A fact the gateway does not report gets no
   card. A row of em dashes is a worse answer than a shorter page.
2. **Colour is evidence.** Live means proven up. Down means failed. Anything
   that is neither reads on the neutral ramp, and no third hue gets invented to
   fill the gap.
3. **Every state is a specific sentence.** "No results" is a failure of
   design: empty, filtered, unauthorized and unreachable are four different
   conditions with four different remedies, and the operator must not have to
   guess which one they are in.
4. **The URL is the artifact.** Filters, sort, selection and route all live in
   the address bar, because the output of using this console is usually a link
   pasted into a chat.
5. **Degrade, never break.** The console and the gateway ship separately and
   skew by design. A surface the gateway is too old for is absent, not broken.

## Accessibility & Inclusion

WCAG 2.2 AA as the floor, and the palette already clears it with room: body
text 18.7:1, muted 9.9:1. Dark-only is a deliberate brand decision, not an
oversight — fold has no per-origin theming.

- Keyboard-complete. Every action reachable without a pointer, with a visible
  focus indicator (the Live ring) that is never removed.
- Reduced motion honoured for every animation; motion here only ever conveys
  state, so removing it costs nothing.
- Colour is never the sole channel for status: connected/breaker/health states
  carry a word as well as a hue, for both colour-blind operators and anyone
  reading a screenshot.
- Dense by intent (34px controls, not 44px) because the surface is a laptop
  inspection tool. Small controls compensate with hit areas larger than their
  visual box rather than by growing.
