import type { HttpContext } from "@adonisjs/core/http";

import FleetMetricsService from "#services/platform/fleet_metrics_service";
import { toOverview } from "#transformers/platform/metrics_transformer";

/**
 * GET /api/v1/platform/overview — fleet rollup for the console home (shop status counts, 30-day GMV
 * per currency, 30-day orders, total customers, total storage). Cross-tenant; runs on the admin
 * connection (RULE A). Guarded by `platformAuth`.
 */
export default class PlatformOverviewController {
    async show(_ctx: HttpContext) {
        const overview = await new FleetMetricsService().overview();
        return { data: toOverview(overview) };
    }
}
