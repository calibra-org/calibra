import type { SandboxSnapshot, ServiceStatus } from "../core/snapshot-types";

/** A selectable row in the services view — a service or a tenant. */
export interface TuiRow {
    key: string;
    kind: "service" | "tenant";
    label: string;
    status: ServiceStatus;
    url: string | null;
    /** Log stream id to tail, or null if the row has no log. */
    logName: string | null;
    /** Service id to restart, or null if the row isn't restartable. */
    restartTarget: string | null;
}

/** Flatten a snapshot into the ordered, selectable rows the services view renders. */
export function buildRows(snapshot: SandboxSnapshot): TuiRow[] {
    const rows: TuiRow[] = snapshot.services.map((service) => ({
        key: `svc:${service.id}`,
        kind: "service",
        label: service.label,
        status: service.status,
        url: service.url,
        logName: service.id === "api" ? "api.ndjson" : service.id,
        restartTarget: service.id,
    }));
    for (const tenant of snapshot.tenants) {
        rows.push({
            key: `tenant:${tenant.slug}`,
            kind: "tenant",
            label: `${tenant.name} (admin)`,
            status: tenant.adminStatus,
            url: tenant.adminUrl,
            logName: null,
            restartTarget: null,
        });
    }
    return rows;
}
