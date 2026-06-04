import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Tenant from "#models/tenant";
import FleetMetricsService, { type SeriesUnit } from "#services/platform/fleet_metrics_service";
import { toTenantMetrics } from "#transformers/platform/metrics_transformer";
import { type MetricsRange, metricsQueryValidator } from "#validators/platform/metrics_validator";

/** Map a range token to a from/to window plus the default series bucket. */
function resolveRange(range: MetricsRange, unitOverride?: SeriesUnit): { from: DateTime; to: DateTime; unit: SeriesUnit } {
    const to = DateTime.utc();
    const presets: Record<MetricsRange, { from: DateTime; unit: SeriesUnit }> = {
        "7d": { from: to.minus({ days: 7 }), unit: "day" },
        "30d": { from: to.minus({ days: 30 }), unit: "day" },
        "90d": { from: to.minus({ days: 90 }), unit: "week" },
        "12m": { from: to.minus({ months: 12 }), unit: "month" },
    };
    const preset = presets[range];
    return { from: preset.from, to, unit: unitOverride ?? preset.unit };
}

/**
 * GET /api/v1/platform/tenants/{id}/metrics — native per-tenant business KPIs + a revenue/orders/
 * new-customers time series over the requested range (RULE D: native charts, not embedded Grafana).
 * Cross-tenant connection; guarded by `platformAuth`.
 */
export default class PlatformMetricsController {
    async show(ctx: HttpContext) {
        const { range = "30d", unit } = await ctx.request.validateUsing(metricsQueryValidator);
        const tenant = await Tenant.query({ client: db.connection("postgres_admin") })
            .where("id", ctx.params.id)
            .whereNull("deleted_at")
            .first();
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }

        const window = resolveRange(range, unit);
        const metrics = await new FleetMetricsService().tenantMetrics(
            Number(tenant.id),
            window.from,
            window.to,
            window.unit,
            tenant.currencyCode,
        );
        return { data: toTenantMetrics(metrics) };
    }
}
