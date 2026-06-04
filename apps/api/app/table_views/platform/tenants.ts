import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import Tenant from "#models/tenant";

/**
 * Fleet list view for the control plane. Per-column filter/sort + pagination flow through
 * TableView (e.g. `filter[]=status:eq:active`, `filter[]=plan_id:eq:2`); the `q` extra is a
 * free-text search across slug + name handled controller-side. Runs on the `postgres_admin`
 * connection (cross-tenant, no RLS) — the controller passes a pre-scoped builder to `run`.
 */
export const platformTenantsView = createTableView({
    model: Tenant,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        slug: { type: "string", filterable: true, orderable: true },
        name: { type: "string", filterable: true, orderable: true },
        status: { type: "enum", filterable: true, orderable: true, values: ["active", "suspended", "archived"] },
        db_tier: { type: "enum", filterable: true, orderable: true, values: ["shared", "dedicated"] },
        plan_id: { type: "bigint", filterable: true, orderable: false, column: "plan_id" },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["created_at", "desc"]],
});

export type PlatformTenantsViewQuery = InferTableViewQuery<typeof platformTenantsView>;
