import { TenantUsageDailySchema } from "#database/schema";

/**
 * Per-tenant daily usage rollup (global control-plane table — `tenant_id` present for filtering, no
 * RLS, since the platform meters across all tenants). Phase 2/5 populate it.
 */
export default class TenantUsageDaily extends TenantUsageDailySchema {
    static table = "tenant_usage_daily";
}
