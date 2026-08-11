// One upstream, in full.
//
// This view did not exist before: the list crammed endpoints, labels, owner
// and error text into cells that could only be read by scrolling sideways.
// The answer is a detail route per upstream — a stable URL for one thing,
// with room to show all of it — which is what an operator sends to whoever
// owns the one that is down.
//
// Its data comes from the federation snapshot already in cache, not from a
// second request: fold has no per-upstream read endpoint, and inventing one
// round-trip per row would be slower and no fresher.
import { createRoute, Link } from '@tanstack/react-router'
import { Card, CardGroup } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { CopyButton } from '@/components/CopyButton'
import { DataTable, type Column } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { JsonPane } from '@/components/JsonPane'
import { rootRoute, useFederation } from './root'
import type { EndpointStatus } from '@/lib/federation'
import { latency, orEmpty, ownerLine, pretty } from '@/lib/format'

const endpointColumns: Array<Column<EndpointStatus>> = [
  {
    key: 'url',
    header: 'Endpoint',
    value: (e) => e.url ?? '',
    render: (e) => orEmpty(e.url),
    wrap: true,
  },
  {
    key: 'healthy',
    header: 'Health',
    value: (e) => (e.healthy ? 1 : 0),
    render: (e) => (e.healthy ? 'healthy' : 'unhealthy'),
    tone: (e) => (e.healthy ? 'ok' : 'bad'),
    sortable: false,
  },
]

function UpstreamDetail() {
  const { id } = upstreamDetailRoute.useParams()
  const { state, isPending } = useFederation()

  if (!state) {
    return <EmptyState title={isPending ? 'Reading the federation snapshot…' : 'No federation snapshot'} />
  }

  const upstream = state.upstreams.find((u) => u.id === id)
  if (!upstream) {
    return (
      <EmptyState
        title={`No upstream "${id}" in this federation`}
        hint={
          <>
            It may have been removed, or it may sit outside the visibility your tenant is granted.{' '}
            <Link to="/upstreams">Back to upstreams</Link>
          </>
        }
      />
    )
  }

  const labels = Object.entries(upstream.labels ?? {})

  return (
    <>
      <PageHeader
        title={upstream.id}
        back={
          <Link to="/upstreams" className="back">
            ← Upstreams
          </Link>
        }
        actions={<CopyButton value={upstream.id} label="Upstream ID" />}
      />

      <CardGroup title="Status">
        <Card
          label="connected"
          value={upstream.connected ? 'yes' : 'no'}
          tone={upstream.connected ? 'ok' : 'bad'}
        />
        <Card
          label="breaker"
          value={orEmpty(upstream.breaker)}
          tone={upstream.breaker === 'closed' ? 'ok' : upstream.breaker === 'open' ? 'bad' : 'warn'}
        />
        <Card label="latency" value={upstream.connected ? latency(upstream.latencyMs) : '—'} />
        {upstream.error ? <Card label="error" value={upstream.error} tone="bad" wrap /> : null}
      </CardGroup>

      <CardGroup title="Configuration">
        <Card label="namespace" value={orEmpty(upstream.namespace)} />
        <Card label="source" value={orEmpty(upstream.source)} />
        <Card label="auth strategy" value={orEmpty(upstream.authStrategy)} />
        {upstream.url ? (
          <Card
            label="url"
            value={
              <>
                {upstream.url}
                <CopyButton value={upstream.url} label="Upstream URL" />
              </>
            }
            wrap
          />
        ) : null}
      </CardGroup>

      <CardGroup title="Ownership">
        <Card label="owner" value={ownerLine(upstream.owner)} />
        {/* Contact is in fold's Owner struct and was never shown. On a page
            about an upstream that is down, it is the most useful field here. */}
        {upstream.owner?.contact ? (
          <Card
            label="contact"
            value={
              <>
                {upstream.owner.contact}
                <CopyButton value={upstream.owner.contact} label="Contact" />
              </>
            }
            wrap
          />
        ) : null}
      </CardGroup>

      <section class="group">
        <div class="group-head">
          <h2>Labels</h2>
        </div>
        {labels.length ? (
          <div class="chips">
            {labels.map(([k, v]) => (
              <span key={k} class="chip">
                {k}={v}
              </span>
            ))}
          </div>
        ) : (
          <p class="muted">No labels on this upstream.</p>
        )}
      </section>

      <section class="group">
        <div class="group-head">
          <h2>Endpoints</h2>
        </div>
        <DataTable
          caption={`Endpoints for ${upstream.id}`}
          columns={endpointColumns}
          rows={upstream.endpoints ?? []}
          rowKey={(e) => e.url ?? 'endpoint'}
          empty={
            <EmptyState
              title="Single endpoint"
              hint="This upstream is not load-balanced, so the balancer reports no per-replica view."
            />
          }
        />
      </section>

      {/* The raw record, because the console will always lag the gateway by
          a field or two and an operator should never have to curl the API to
          see one this page has not learned to render yet. */}
      <JsonPane
        title="Raw record"
        copyLabel="Raw record"
        text={pretty(upstream)}
        placeholder=""
      />
    </>
  )
}

export const upstreamDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upstreams/$id',
  component: UpstreamDetail,
})
