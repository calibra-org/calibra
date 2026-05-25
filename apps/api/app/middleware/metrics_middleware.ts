import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import { recordHttpRequest, resetRuntimeSamplerState } from "#services/metrics/domain_metrics";
import { metricsRegistry } from "#services/metrics/registry";

/**
 * Server-level middleware that records `http_requests_total` + `http_request_duration_seconds`
 * for every request, including unmatched 404s and authentication failures. Histogram buckets
 * cover 5ms → 10s in a Prometheus-conventional spread.
 *
 * The matched-route pattern (e.g. `/api/v1/products/:id`) — not the raw URL — is used as the
 * `route` label so cardinality stays bounded. Unmatched requests collapse to `"unmatched"`.
 *
 * The `/metrics` scrape endpoint reads from {@link metricsRegistry} via {@link renderPrometheusText}
 * without re-entering middleware, so a downstream throw can't break observability.
 */
export default class MetricsMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const start = process.hrtime.bigint();
        try {
            await next();
        } finally {
            const elapsedNs = process.hrtime.bigint() - start;
            const durationSec = Number(elapsedNs) / 1e9;
            const method = ctx.request.method().toUpperCase();
            /**
             * `request.matchedRoute()?.pattern` returns the router pattern like
             * `/api/v1/products/:id`; we fall back to `unmatched` so we don't blow up
             * cardinality with raw URLs containing IDs. Adonis 7 exposes the matched
             * route lazily — check both `matchedRoute()` and the deprecated `route` shape.
             */
            const routeMaybe =
                (ctx.route as { pattern?: string } | undefined)?.pattern ??
                (ctx.request as unknown as { matchedRoute?: () => { pattern?: string } | null }).matchedRoute?.()?.pattern ??
                "unmatched";
            const status = ctx.response.getStatus();
            recordHttpRequest(method, routeMaybe, status, durationSec);
        }
    }
}

/**
 * Render the registry as Prometheus text-exposition format (v0.0.4). Async because runtime
 * gauges and the queue-depth gauge collect lazily on render. Called by the `/metrics` route.
 */
export async function renderPrometheusText(): Promise<string> {
    return metricsRegistry.render();
}

/**
 * Test-only helper. Clears every counter, gauge, and histogram across the registry so one
 * spec's traffic doesn't bleed into another's assertions.
 */
export function resetMetrics(): void {
    metricsRegistry.reset();
    resetRuntimeSamplerState();
}
