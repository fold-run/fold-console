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
import { Card, CardGroup } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { CopyButton } from '@/components/CopyButton'
import { EmptyState } from '@/components/EmptyState'
import { rootRoute, useFederation } from './root'
import { docsLink } from '@/lib/docs'
import { supports } from '@/lib/version'
import { interval, orEmpty, timestamp } from '@/lib/format'

function Overview() {
  const { state, isPending } = useFederation()

  if (!state) {
    return isPending ? (
      <EmptyState title="Reading the federation snapshot…" />
    ) : (
      <EmptyState
        title="No federation snapshot"
        hint="Check that server.introspection.enabled is set on the gateway."
      />
    )
  }

  const upstreamsHealthy = state.upstreams.filter((u) => u.connected).length
  const total = state.upstreams.length
  const docs = (topic: Parameters<typeof docsLink>[0]) => docsLink(topic, state.version)

  return (
    <>
      <PageHeader
        title="Overview"
        lede={
          <>
            The gateway's own view of its configuration and federation.{' '}
            <a href={docs('configuration')} rel="noopener">
              Configuration reference
            </a>
          </>
        }
      />

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
            View all {total} →
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
          <a href={docs('policy')} class="group-action" rel="noopener">
            Policy docs →
          </a>
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
          <a href={docs('observability')} class="group-action" rel="noopener">
            Observability docs →
          </a>
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
            <a href={docs('discovery')} class="group-action" rel="noopener">
              Discovery docs →
            </a>
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

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Overview,
})
