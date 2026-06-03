/**
 * Public route table. Versioned under `/api/v1` so breaking changes can ship behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 *
 * Per-domain route files live under `start/routes/`; this module imports each one so the registry
 * is fully populated before AdonisJS boots the HTTP server.
 */

import router from "@adonisjs/core/services/router";

import { renderPrometheusText } from "#middleware/metrics_middleware";
import { healthChecks } from "#start/health";

/**
 * Always-200 liveness probe. The orchestrator uses this to know the process is alive
 * (sockets opened, event loop running); failing it triggers a restart.
 */
router.get("/health", async () => ({ status: "ok" }));
router.get("/health/live", async () => ({ status: "ok" }));

/**
 * Readiness probe — 200 when every registered check is healthy, 503 when any single
 * one is not. The orchestrator routes traffic away from a 503 pod, but does not
 * restart it (a flaky dependency isn't the pod's fault). Report body is JSON for the
 * `spin doctor` summary table.
 */
router.get("/health/ready", async ({ response }) => {
    const report = await healthChecks.run();
    response.status(report.isHealthy ? 200 : 503);
    return report;
});

/**
 * Prometheus scrape endpoint. The spin's Prometheus targets `host.docker.internal:<api>/metrics`
 * every 15s; production swaps in the platform's scraper. Unversioned + unauthenticated by
 * design — only the internal network reaches it, and the scrape interval is too low to be
 * a viable exfiltration channel anyway.
 */
router.get("/metrics", async ({ response }) => {
    response.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return renderPrometheusText();
});

await import("./routes/catalog.js");
await import("./routes/auth.js");
await import("./routes/platform.js");
await import("./routes/account.js");
await import("./routes/cart.js");
await import("./routes/checkout.js");
await import("./routes/account_orders.js");
await import("./routes/currency.js");
await import("./routes/storefront.js");
await import("./routes/admin_catalog.js");
await import("./routes/admin_customers.js");
await import("./routes/admin_customer_notes.js");
await import("./routes/admin_customer_tags.js");
await import("./routes/admin_customer_segments.js");
await import("./routes/admin_customer_actions.js");
await import("./routes/admin_orders.js");
await import("./routes/admin_coupons.js");
await import("./routes/admin_refunds.js");
await import("./routes/admin_notes.js");
await import("./routes/admin_payments.js");
await import("./routes/admin_reports.js");
await import("./routes/admin_insights.js");
await import("./routes/admin_settings.js");
await import("./routes/admin_media.js");
await import("./routes/admin_product_imports.js");
await import("./routes/admin_product_exports.js");
await import("./routes/uploads.js");
await import("./routes/payment.js");
