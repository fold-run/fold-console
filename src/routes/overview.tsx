// Overview: what this gateway is configured to do.
//
// The old console put every fact in one flat grid of cards. Grouping them
// under titled headings is, at fold's card count, the difference between a
// dashboard and a wall of monospace — an operator asking "is audit on" should
// not have to read the rate limits to find out.
//
// Cards for absent facts do not render. On a gateway without tenancy,
// tracing, or discovery, this page is short; on a fully configured one it is
// long. Neither state shows a row of em dashes.
import { createRoute, Link } from '@tanstack/react-router'
import { Banner } from '@/components/Banner'
import { Card, CardGroup } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { CopyButton } from '@/components/CopyButton'
import { EmptyState } from '@/components/EmptyState'
import { DocsLink } from '@/components/DocsLink'
import { SkeletonCards } from '@/components/Skeleton'
import { rootRoute, useFederation } from './root'
import { supports } from '@/lib/version'
import type { FederationState } from '@/lib/federation'
import { interval, orEmpty, timestamp } from '@/lib/format'

function Overview() {
  const { state, isPending } = useFederation()

  if (!state) {
    // Held in the shape of the answer, so nothing jumps when it lands.
    return isPending ? (
      <>
        <PageHeader title="Overview" />
        <section class="group" aria-label="Loading">
          <p class="visually-hidden" role="status">Reading the federation snapshot.</p>
          <SkeletonCards count={5} />
        </section>
        <section class="group" aria-hidden="true">
          <SkeletonCards count={3} />
        </section>
      </>
    ) : (
      <EmptyState
        title="No federation snapshot"
        hint="Check that server.introspection.enabled is set on the gateway."
      />
    )
  }

  const upstreamsHealthy = state.upstreams.filter((u) => u.connected).length
  const total = state.upstreams.length

  return (
    <>
      <PageHeader
        title="Overview"
        lede="The gateway's own view of its configuration and federation."
        actions={<DocsLink topic="configuration" version={state.version}>Configuration</DocsLink>}
      />

      <Attention state={state} />

      <CardGroup title="Gateway">
        <Card label="version" value={orEmpty(state.version)} />
        <Card
          label="endpoint"
          value={
            <>
              {state.mcpPath}
              <CopyButton value={state.mcpPath} label="MCP path" />
            </>
          }
        />
        <Card
          label="auth"
          value={(state.authRequired ? 'required' : 'disabled') + (state.emaEnabled ? ' + EMA' : '')}
          tone={state.authRequired ? undefined : 'warn'}
        />
        <Card label="state" value={state.sharedState ? 'shared (Redis)' : 'in-process'} />
        {state.passthrough ? <Card label="mode" value="passthrough" tone="warn" /> : null}
        {supports(state.version, 'consoleSource') && state.consoleSource ? (
          <Card label="console build" value={state.consoleSource.slice(0, 12)} />
        ) : null}
      </CardGroup>

      <CardGroup
        title="Federation"
        action={
          <Link to="/upstreams" className="group-action">
            All upstreams →
          </Link>
        }
      >
        <Card
          label="upstreams"
          value={`${state.staticUpstreams} static + ${state.discoveredUpstreams} discovered`}
        />
        <Card
          label="connected"
          value={`${upstreamsHealthy} / ${total}`}
          tone={total === 0 ? 'warn' : upstreamsHealthy === total ? 'ok' : 'bad'}
        />
        <Card
          label="routing"
          value={`sep ${state.namespaceSeparator} · ${state.pageSize ? `page size ${state.pageSize}` : 'no pagination'}`}
        />
      </CardGroup>

      <CardGroup
        title="Governance"
        action={
          <DocsLink topic="policy" version={state.version}>Policy docs</DocsLink>
        }
      >
        <Card
          label="policy"
          value={`${state.policyDefaultDecision}, ${state.policyRules} rule(s)`}
          tone={state.policyDefaultDecision === 'deny' ? undefined : 'warn'}
        />
        {state.globalRequestsPerMinute ? (
          <Card
            label="rate limit"
            value={
              `${state.globalRequestsPerMinute}/min global` +
              (state.perPrincipalRequestsPerMinute
                ? ` · ${state.perPrincipalRequestsPerMinute}/min per principal`
                : '')
            }
          />
        ) : null}
        {state.viewerGroups?.length ? (
          <Card label="viewers" value={state.viewerGroups.join(', ')} wrap />
        ) : null}
      </CardGroup>

      {state.tenant && supports(state.version, 'tenantGovernance') ? (
        <CardGroup title="Your tenant">
          {/* A viewer in a tenant is seeing that tenant's federation, not the
              whole one — say so, rather than leaving a short upstream list
              looking like an outage. */}
          <Card label="tenant" value={state.tenant} />
          {state.tenantRequestsPerMinute ? (
            <Card label="requests" value={`${state.tenantRequestsPerMinute}/min`} />
          ) : null}
          {state.tenantUpstreamCalls ? (
            <Card
              label="budget"
              value={`${state.tenantUpstreamCalls} calls/${orEmpty(state.tenantBudgetPeriod)}`}
            />
          ) : null}
        </CardGroup>
      ) : null}

      <CardGroup
        title="Observability"
        action={
          <DocsLink topic="observability" version={state.version}>Observability docs</DocsLink>
        }
      >
        <Card
          label="audit"
          value={state.auditSinks.length ? state.auditSinks.join(' + ') : 'none'}
          tone={state.auditSinks.length ? undefined : 'warn'}
        />
        <Card label="tracing" value={state.tracingEnabled ? 'OTLP' : 'off'} />
      </CardGroup>

      {state.discovery ? (
        <CardGroup
          title="Discovery"
          action={
            <DocsLink topic="discovery" version={state.version}>Discovery docs</DocsLink>
          }
        >
          <Card label="source" value={state.discovery.url} wrap />
          <Card label="interval" value={interval(state.discovery.intervalMs)} />
          {state.discovery.lastOutcome ? (
            <Card
              label="last sync"
              value={`${state.discovery.lastOutcome} · ${timestamp(state.discovery.lastSyncAt)}`}
              tone={
                state.discovery.lastOutcome === 'applied' || state.discovery.lastOutcome === 'unchanged'
                  ? 'ok'
                  : 'bad'
              }
              wrap
            />
          ) : (
            <Card label="last sync" value="not yet run" tone="warn" />
          )}
        </CardGroup>
      ) : null}
    </>
  )
}

/**
 * The one thing worth acting on, above the facts.
 *
 * Job one in PRODUCT.md is "is the federation healthy, and if not which
 * upstream?", and this page answered it with a count buried in the Federation
 * card, leaving the operator to reach /upstreams and work out the filter. The
 * answer and the way to it are now the first thing on the page.
 *
 * It renders nothing when there is nothing to say. A banner that is always
 * present is furniture, and an operator who has learned to skip it has learned
 * to skip it on the day it matters.
 *
 * Half-open breakers are deliberately not counted: half-open is neither proven
 * nor failed, and an upstream reporting no breaker at all is version skew
 * rather than a state.
 */
function Attention({ state }: { state: FederationState }) {
  const down = state.upstreams.filter((u) => !u.connected)
  const tripped = state.upstreams.filter((u) => u.connected && u.breaker === 'open')

  if (down.length === 0 && tripped.length === 0) return null

  // One sentence, and the link resolves the larger half of it. Filtering by
  // status is the filter the list actually has; there is none for breakers, so
  // that case sends the operator to the unfiltered table rather than to a URL
  // that would quietly drop what the sentence just named.
  return (
    <Banner tone={down.length ? 'bad' : 'warn'} announce={false}>
      {down.length ? (
        <>
          {down.length === 1
            ? `${down[0]?.id} is not connected`
            : `${down.length} upstreams are not connected`}
          {tripped.length
            ? `, and ${tripped.length === 1 ? 'one more has' : `${tripped.length} more have`} an open breaker`
            : ''}
          .{' '}
          <Link to="/upstreams" search={{ status: 'disconnected' }}>
            Show them
          </Link>
        </>
      ) : (
        <>
          {tripped.length === 1
            ? `${tripped[0]?.id} is connected but its breaker is open`
            : `${tripped.length} upstreams are connected but their breakers are open`}
          {tripped.length === 1
            ? '. Calls to it fail fast rather than being tried.'
            : '. Calls to them fail fast rather than being tried.'}{' '}
          <Link to="/upstreams">Show the federation</Link>
        </>
      )}
    </Banner>
  )
}

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Overview,
})
