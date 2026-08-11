// The federation, drawn.
//
// This is fold's fold-line vocabulary (DESIGN.md §5: "authored SVG, fold-line
// vocabulary, aria-label; active path in Live") applied to live data, which is
// the one place it has to depart from fold.run. Every diagram on the site is
// hand-authored; this one cannot be, because nobody knows the shape of an
// operator's federation in advance. So the vocabulary is implemented as a
// generator: dashed fold-lines on the fold-line grey, nodes on Rack with Trace
// strokes, the gateway stroked in Live and carrying the wordmark rather than a
// label, notch marks at the governed boundary, and a grain arrow on each route
// that is actually carrying traffic.
//
// WHAT IT SAYS THAT THE TABLE CANNOT
//
// Two things. The fan: one endpoint in front of N servers is fold's whole
// proposition, and a table of rows does not show it. And the boundary: every
// route crosses the same notched seam, which is where auth, policy and audit
// happen. A row cannot draw a thing that is true of all rows at once.
//
// Everything else — the per-upstream detail — stays in the table, which is why
// each node here is a link into the detail route rather than a tooltip.
import { WORDMARK_PATH, wordmarkTransform } from './Wordmark'
import type { FederationState, UpstreamHealth } from '@/lib/federation'
import { latency } from '@/lib/format'

// Geometry, in user units. The viewBox is fixed and the figure is capped at
// its natural width, so the drawing never scales up past 1:1 and its mono
// labels stay at the size they were designed at.
const VB_W = 980
const PAD_Y = 20
const NODE_H = 34
const NODE_GAP = 12
const PITCH = NODE_H + NODE_GAP
const NODE_X = 268
const NODE_W = 300
// Left of the gate, with room for the boundary notches. At GATE_X = 8 they ran
// off the viewBox and the seam on the inbound side was simply missing.
const GATE_X = 26
const GATE_W = 108
const GATE_H = 76
const ANNO_X = NODE_X + NODE_W + 18

/**
 * Beyond this the fan stops being a shape and becomes a texture: forty routes
 * from one point already reads as "many", and the eightieth adds nothing the
 * count in the caption does not. The remainder is named rather than dropped
 * silently.
 */
const MAX_NODES = 40

/**
 * Where a route leaves the gateway.
 *
 * Every route starting from one point draws a starburst; fold's drawings fan
 * off an edge. Origins spread across the gate's right side, inset so they stay
 * on the box however many upstreams there are.
 */
function originY(i: number, count: number, gateCy: number): number {
  if (count < 2) return gateCy
  const span = GATE_H - 26
  return gateCy - span / 2 + (span * i) / (count - 1)
}

/** Rough advance width of Geist Mono, as a fraction of font size. */
const MONO_ADVANCE = 0.6

function truncate(text: string, px: number, fontSize: number): string {
  const max = Math.floor(px / (fontSize * MONO_ADVANCE))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(1, max - 1))}…`
}

type RouteState = 'live' | 'down' | 'idle'

function routeState(u: UpstreamHealth): RouteState {
  // A gateway that reports no breaker at all is not thereby unproven: absence
  // is skew, not a state. Connected with nothing said against it is live.
  if (u.connected && (u.breaker === 'closed' || !u.breaker)) return 'live'
  if (!u.connected || u.breaker === 'open') return 'down'
  // Half-open: neither proven up nor failed, so neither Live nor Down.
  return 'idle'
}

function describe(u: UpstreamHealth): string {
  const state = u.connected ? 'connected' : 'not connected'
  const breaker = u.breaker ? `, breaker ${u.breaker}` : ''
  const detail = u.connected ? `, ${latency(u.latencyMs)}` : u.error ? `, ${u.error}` : ''
  return `${u.id}: ${state}${breaker}${detail}`
}

interface Props {
  state: FederationState
  upstreams: UpstreamHealth[]
}

export function Topology({ state, upstreams }: Props) {
  const shown = upstreams.slice(0, MAX_NODES)
  const hidden = upstreams.length - shown.length

  // The gate sets a floor on the drawing's height, so with one or two
  // upstreams the stack is shorter than the canvas. Centre it, or a lone
  // upstream sits above a gateway it is level with and its route leaves as an
  // S-curve to reach a node that should be straight ahead.
  const stackH = shown.length * PITCH - NODE_GAP
  const fanH = Math.max(stackH, GATE_H)
  const height = fanH + PAD_Y * 2
  const nodeTop = PAD_Y + (fanH - stackH) / 2
  const gateCy = height / 2
  const gateCx = GATE_X + GATE_W / 2

  const liveCount = upstreams.filter((u) => routeState(u) === 'live').length
  const summary =
    `${upstreams.length} upstream${upstreams.length === 1 ? '' : 's'} behind one gateway endpoint at ` +
    `${state.mcpPath}; ${liveCount} connected. Every route crosses the gateway's ` +
    `auth, policy and audit boundary.`

  return (
    <figure class="topology">
      {/* The drawing is the summary; the table is the detail, and this says so
          rather than leaving a screen-reader user to infer that the graphic
          they cannot see has an equivalent one tab away. */}
      <p class="visually-hidden">{summary} Each upstream links to its detail page; the same data is in the table view.</p>

      <div class="topology-scroll">
        <svg class="topology-svg" viewBox={`0 0 ${VB_W} ${height}`} width={VB_W} height={height}>
          {/* Routes first: the gateway node's opaque fill paints over them, so
              a route slides behind the box rather than terminating at its edge.
              fold.run uses the same ordering deliberately. */}
          {shown.map((u, i) => {
            const cy = nodeTop + i * PITCH + NODE_H / 2
            const oy = originY(i, shown.length, gateCy)
            const d = `M ${GATE_X + GATE_W} ${oy} C ${GATE_X + GATE_W + 64} ${oy}, ${NODE_X - 64} ${cy}, ${NODE_X} ${cy}`
            const st = routeState(u)
            return (
              <path
                key={u.id}
                class={st === 'live' ? 'fold-active' : st === 'down' ? 'fold-broken' : 'fold-dash'}
                d={d}
              />
            )
          })}

          {/* Grain arrows, on the routes that are actually carrying. */}
          {shown.map((u, i) =>
            routeState(u) === 'live' ? (
              <path
                key={`a-${u.id}`}
                class="fold-arrow"
                d={`M ${NODE_X - 12} ${nodeTop + i * PITCH + NODE_H / 2 - 6} L ${NODE_X} ${nodeTop + i * PITCH + NODE_H / 2} L ${NODE_X - 12} ${nodeTop + i * PITCH + NODE_H / 2 + 6} Z`}
              />
            ) : null,
          )}

          {/* The governed boundary: notch marks at both edges of the gateway,
              the tailor's-pattern device fold uses for a seam. This is the
              thing no row of a table can state — that all of it passes through
              one place where auth, policy and audit apply. */}
          <path
            class="fold-notch"
            d={`M ${GATE_X - 8} ${gateCy - 8} v 16 M ${GATE_X - 4} ${gateCy - 11} v 22`}
          />
          <path
            class="fold-notch"
            d={`M ${GATE_X + GATE_W + 4} ${gateCy - 11} v 22 M ${GATE_X + GATE_W + 8} ${gateCy - 8} v 16`}
          />

          {/* The gateway. Stroked in Live because it is the proven thing, and
              carrying the mark because it is the product; every other node here
              is a wire string. */}
          <g>
            <title>{`fold gateway, ${state.mcpPath}`}</title>
            <rect class="fold-gate" x={GATE_X} y={gateCy - GATE_H / 2} width={GATE_W} height={GATE_H} rx="2" />
            <path class="fold-node-mark" d={WORDMARK_PATH} transform={wordmarkTransform(gateCx, gateCy - 8, 56)} />
            <text class="fold-anno" x={gateCx} y={gateCy + 18} text-anchor="middle">
              {truncate(state.mcpPath, GATE_W - 12, 11)}
            </text>
          </g>
          <text class="fold-anno" x={gateCx} y={gateCy + GATE_H / 2 + 16} text-anchor="middle">
            {truncate(`${state.policyDefaultDecision} · ${state.policyRules} rules`, 150, 11)}
          </text>

          {/* Upstream nodes. Links, not decorations: the drawing is how you get
              to the one that is down. Plain anchors with a fragment href —
              this console routes on the hash, so the router picks the
              navigation up without any click interception. */}
          {shown.map((u, i) => {
            const y = nodeTop + i * PITCH
            const cy = y + NODE_H / 2
            const st = routeState(u)
            const label = u.namespace ? `${u.namespace}${state.namespaceSeparator}*` : u.id
            const anno = u.connected
              ? u.breaker && u.breaker !== 'closed'
                ? `${latency(u.latencyMs)} · breaker ${u.breaker}`
                : latency(u.latencyMs)
              : (u.error ?? 'not connected')
            return (
              <a
                key={u.id}
                class="fold-link"
                href={`#/upstreams/${encodeURIComponent(u.id)}`}
                aria-label={describe(u)}
              >
                <title>{describe(u)}</title>
                <rect class="fold-node" x={NODE_X} y={y} width={NODE_W} height={NODE_H} rx="2" />
                <text class="fold-node-label" x={NODE_X + 14} y={cy + 5}>
                  {truncate(label, NODE_W - 28, 14)}
                </text>
                <text class={`fold-anno ${st === 'down' ? 'is-down' : ''}`} x={ANNO_X} y={cy + 4}>
                  {truncate(anno, VB_W - ANNO_X - 8, 11)}
                </text>
              </a>
            )
          })}
        </svg>
      </div>

      <figcaption class="muted topology-caption">
        {liveCount} of {upstreams.length} connected
        {hidden > 0 ? ` · ${hidden} more not drawn, see the table` : ''}
        {' · every route crosses auth, policy and audit'}
      </figcaption>
    </figure>
  )
}
