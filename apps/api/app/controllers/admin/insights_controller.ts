import type { HttpContext } from "@adonisjs/core/http";

import { fetchCustomerInsights } from "#services/customer_stats_service";

/**
 * Cross-cutting dashboard insights that don't fit under a single resource — currently a single
 * customer-summary endpoint that the dashboard renders as the "Customer summary" card. Anything
 * with 30-day deltas, rolling sparklines, or "snapshot for the dashboard" framing lands here so
 * the per-resource list endpoints stay focused on list-page concerns.
 */
export default class AdminInsightsController {
    /** GET /api/v1/admin/insights/customers — totals, 30d deltas, and 30d daily sparklines. */
    async customers(_ctx: HttpContext) {
        const data = await fetchCustomerInsights();
        return { data };
    }
}
