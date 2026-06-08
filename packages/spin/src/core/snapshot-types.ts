import type { ServiceCategory, ServiceKind } from "./catalog";
import type { SpinPorts } from "./ports";

/**
 * The node-free snapshot contract — the single shape consumed by the CLI diagnostics, the Ink TUI,
 * AND the browser panel. Every import here is `import type` (erased at build) so this module pulls
 * in **zero** node built-ins and can be bundled into the browser client. {@link import("./snapshot")}
 * produces it; the three UIs only render it. This replaces the legacy three-way divergence between
 * `collectDoctorReport`, `collectListRows`, and the panel's `buildServiceCatalog`.
 */

/** Coarse health used by the diagnostics + exit-code contract. */
export type ServiceStatus = "up" | "down" | "unknown";

export interface ServiceRow {
    id: string;
    label: string;
    category: ServiceCategory;
    kind: ServiceKind;
    /** Canonical operator URL (Caddy host, or a direct/scheme URL for non-fronted services). */
    url: string | null;
    /** Direct host URL when the service also publishes a host port. */
    directUrl?: string;
    status: ServiceStatus;
    note?: string;
}

/** One seeded tenant's reachability — the multi-tenant signal the legacy doctor never had. */
export interface TenantRow {
    slug: string;
    name: string;
    adminUrl: string;
    webUrl: string;
    adminStatus: ServiceStatus;
}

/** Summary of any in-flight/failed pipeline run (from the run-state record). */
export interface RunSummary {
    kind: "in-progress" | "interrupted" | "failed" | "none";
    step?: string;
    error?: string;
}

export interface SandboxSnapshot {
    slug: string;
    branch: string;
    composeProject: string;
    worktreePath: string;
    worktreeExists: boolean;
    dashboardUrl: string;
    pr: number | null;
    prUrl: string | null;
    ports: SpinPorts;
    services: ServiceRow[];
    tenants: TenantRow[];
    queueWorker: { pid: number | null; status: ServiceStatus };
    run: RunSummary;
    glitchtipDsn: string | null;
    legacyDevUi: boolean;
    generatedAt: string;
}

/** True when any probed surface is down — the basis for the doctor/status exit-2 contract. */
export function snapshotHasFailure(snapshot: SandboxSnapshot): boolean {
    if (snapshot.run.kind === "failed") return true;
    if (snapshot.services.some((service) => service.status === "down")) return true;
    if (snapshot.tenants.some((tenant) => tenant.adminStatus === "down")) return true;
    return snapshot.queueWorker.status === "down";
}
