import { PlanSchema } from "#database/schema";

/**
 * Subscription plan (global control-plane data). `limits` is a free-form jsonb bag
 * (`{ max_products, max_storage_bytes, max_orders_per_month, max_staff }`); `dbTier` decides whether
 * tenants on this plan are eligible for promotion to a dedicated database.
 */
export default class Plan extends PlanSchema {
    static table = "plans";
}
