import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

/**
 * Tiny in-memory Prometheus-format exporter. Records two metrics per request:
 *
 *  - `http_requests_total{method,route,status}` — monotonic counter.
 *  - `http_request_duration_seconds{method,route,status}` — histogram with the
 *    standard buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
 *
 * Routes are taken from the matched router pattern (`/api/v1/products/:id`) — not from
 * the raw URL — so cardinality stays bounded. Unmatched requests get `unmatched`.
 *
 * Exposed at `/metrics` via {@link renderPrometheusText}. The endpoint reads from this
 * module's singleton state without going through `next()`, so it can serve metrics even
 * if downstream middleware throws.
 *
 * We do not depend on `prom-client` deliberately — the surface we need is small and a
 * direct dependency was rejected at design time (see commit message + AGENTS.md).
 */

const BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

type CounterKey = `${string}|${string}|${string}`;

/** `${method}|${route}|${status}` keys, monotonic counters. */
const requestCounts = new Map<CounterKey, number>();

/**
 * `${method}|${route}|${status}` keys, value = `{ count, sum, buckets[] }` where
 * `buckets[i]` is the cumulative count of observations ≤ `BUCKETS_SECONDS[i]`.
 */
type HistogramSample = { count: number; sum: number; buckets: number[] };
const histograms = new Map<CounterKey, HistogramSample>();

function freshHistogram(): HistogramSample {
    return { count: 0, sum: 0, buckets: BUCKETS_SECONDS.map(() => 0) };
}

function record(method: string, route: string, status: number, durationSec: number) {
    const key = `${method}|${route}|${status}` as CounterKey;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    const histo = histograms.get(key) ?? freshHistogram();
    histo.count += 1;
    histo.sum += durationSec;
    for (let i = 0; i < BUCKETS_SECONDS.length; i++) {
        if (durationSec <= BUCKETS_SECONDS[i]) histo.buckets[i] += 1;
    }
    histograms.set(key, histo);
}

/**
 * Escape a Prometheus label value per the exposition format — backslashes, double-quotes,
 * and newlines need to be escaped; everything else is literal.
 */
function escapeLabel(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function labels(method: string, route: string, status: string, extra?: { le: string }): string {
    const parts = [`method="${escapeLabel(method)}"`, `route="${escapeLabel(route)}"`, `status="${escapeLabel(status)}"`];
    if (extra) parts.push(`le="${extra.le}"`);
    return `{${parts.join(",")}}`;
}

/**
 * Render the in-memory state as Prometheus text-exposition format (v0.0.4). Includes
 * `# HELP` and `# TYPE` lines for both metrics. Empty when no requests have been seen.
 */
export function renderPrometheusText(): string {
    const lines: string[] = [];

    lines.push("# HELP http_requests_total Total HTTP requests handled by the api.");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, count] of requestCounts) {
        const [method, route, status] = key.split("|");
        lines.push(`http_requests_total${labels(method, route, status)} ${count}`);
    }

    lines.push("# HELP http_request_duration_seconds HTTP request latency histogram.");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const [key, histo] of histograms) {
        const [method, route, status] = key.split("|");
        for (let i = 0; i < BUCKETS_SECONDS.length; i++) {
            const le = String(BUCKETS_SECONDS[i]);
            lines.push(`http_request_duration_seconds_bucket${labels(method, route, status, { le })} ${histo.buckets[i]}`);
        }
        lines.push(`http_request_duration_seconds_bucket${labels(method, route, status, { le: "+Inf" })} ${histo.count}`);
        lines.push(`http_request_duration_seconds_count${labels(method, route, status)} ${histo.count}`);
        lines.push(`http_request_duration_seconds_sum${labels(method, route, status)} ${histo.sum.toFixed(6)}`);
    }

    return `${lines.join("\n")}\n`;
}

/**
 * Reset the in-memory state. Used by Japa tests so one spec's traffic doesn't bleed into
 * another's metrics assertion. Not exported on the route — only the test bootstrap calls it.
 */
export function resetMetrics(): void {
    requestCounts.clear();
    histograms.clear();
}

/**
 * Server-level middleware. Records duration + status for every request, including unmatched
 * ones. Registered in `start/kernel.ts` via `server.use([...])`.
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
            record(method, routeMaybe, status, durationSec);
        }
    }
}
