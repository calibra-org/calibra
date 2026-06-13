import type { PlatformSchemas } from "@calibra/sdk";

/** Friendly aliases for the generated control-plane response shapes (from `platform.v1.yaml`). */
export type Overview = PlatformSchemas["schemas"]["PlatformOverview"];
export type TenantListItem = PlatformSchemas["schemas"]["PlatformTenantListItem"];
export type TenantDetail = PlatformSchemas["schemas"]["PlatformTenantDetail"];
export type TenantDomain = PlatformSchemas["schemas"]["PlatformTenantDomain"];
export type Plan = PlatformSchemas["schemas"]["PlatformPlan"];
export type TenantMetrics = PlatformSchemas["schemas"]["PlatformTenantMetrics"];
export type Operator = PlatformSchemas["schemas"]["Operator"];
export type OperatorCapabilities = PlatformSchemas["schemas"]["OperatorCapabilities"];
export type OperatorCredentialReveal = PlatformSchemas["schemas"]["OperatorCredentialReveal"];
export type OwnerCredentials = PlatformSchemas["schemas"]["PlatformOwnerCredentials"];
export type AuditEvent = PlatformSchemas["schemas"]["AuditEvent"];

export type TenantStatus = "active" | "suspended" | "archived";
export type DbTier = "shared" | "dedicated";
export type MetricsRange = "7d" | "30d" | "90d" | "12m";

/** SDK pagination envelope, mirrored locally for the list hooks. */
export interface Paginated<T> {
    data: T[];
    meta: { page: number; limit: number; total: number; lastPage: number };
}
