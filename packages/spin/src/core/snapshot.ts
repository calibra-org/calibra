import { existsSync } from "node:fs";

import { DEMO_TENANTS, SERVICES, type ServiceDef } from "./catalog";
import { type ComposePsRow, composePs } from "./compose";
import { buildComposeOptions } from "./compose-assembly";
import { isPidAlive, readPid } from "./host-process";
import { effectivePort, isLegacyDevUi } from "./ports";
import { isPortListening, probeHttp, probeTenantViaCaddy, probeViaCaddy } from "./probes";
import { describeRunStep, runActivity } from "./run-state";
import type { SpinMeta } from "./meta";
import type { SandboxSnapshot, ServiceRow, ServiceStatus, TenantRow } from "./snapshot-types";

/**
 * Build the unified {@link SandboxSnapshot} for a spin — the one reconciliation that backs the CLI
 * diagnostics, the TUI, and the web panel. Probes run concurrently; container state is read once
 * from `docker compose ps`. Per-tenant admin reachability is probed through Caddy so a broken
 * tenant route fails here instead of passing green.
 */

export function dashboardUrl(meta: SpinMeta): string {
    const caddyHttps = effectivePort(meta, "caddyHttps");
    if (caddyHttps !== null) return `https://${meta.slug}.spin.localhost:${caddyHttps}/`;
    const agent = effectivePort(meta, "spinAgent");
    return agent !== null ? `http://localhost:${agent}/` : "(no dashboard — legacy meta)";
}

export function serviceUrl(meta: SpinMeta, service: ServiceDef): string | null {
    if (service.id === "caddy") return dashboardUrl(meta);
    if (service.caddy) {
        const caddyHttps = effectivePort(meta, "caddyHttps");
        if (caddyHttps !== null) {
            const host = service.caddy.subdomain === "" ? meta.slug : `${service.caddy.subdomain}.${meta.slug}`;
            return `https://${host}.spin.localhost:${caddyHttps}/`;
        }
    }
    const port = service.portRole ? effectivePort(meta, service.portRole) : null;
    if (port === null) return null;
    if (service.id === "db") return `postgres://localhost:${port}`;
    if (service.id === "redis") return `redis://localhost:${port}`;
    return `http://localhost:${port}/`;
}

function serviceDirectUrl(meta: SpinMeta, service: ServiceDef): string | undefined {
    if (!service.portRole) return undefined;
    if (service.kind !== "host" && !service.published) return undefined;
    const port = effectivePort(meta, service.portRole);
    if (port === null) return undefined;
    if (service.id === "db") return `postgres://localhost:${port}`;
    if (service.id === "redis") return `redis://localhost:${port}`;
    return `http://localhost:${port}/`;
}

async function serviceStatus(
    meta: SpinMeta,
    service: ServiceDef,
    psByService: Map<string, ComposePsRow>,
): Promise<ServiceStatus> {
    const port = service.portRole ? effectivePort(meta, service.portRole) : null;

    if (service.health.kind === "tcp") {
        if (port === null) return "unknown";
        return (await isPortListening(port)) ? "up" : "down";
    }

    if (service.health.kind === "http") {
        const accept = [200, ...(service.health.acceptStatuses ?? [])];
        if (service.health.viaCaddy && service.caddy) {
            if (effectivePort(meta, "caddyHttps") === null) return "unknown";
            return (await probeViaCaddy(meta, service.caddy.subdomain, service.health.path ?? "/", accept)) ? "up" : "down";
        }
        if (port === null) return "unknown";
        /** Host apps: a listening port is the robust up signal (avoids false "down" mid-HMR-compile). */
        if (service.kind === "host") return (await isPortListening(port)) ? "up" : "down";
        return (await probeHttp(`http://localhost:${port}${service.health.path ?? "/"}`, accept)) ? "up" : "down";
    }

    /** process: the queue worker has a pidfile; container workers read from compose ps. */
    if (service.id === "queue") {
        const pid = await readPid(meta.worktreePath, "queue");
        return pid !== null && isPidAlive(pid) ? "up" : "down";
    }
    const row = service.composeService ? psByService.get(service.composeService) : undefined;
    if (!row) return "unknown";
    return row.State === "running" ? "up" : "down";
}

async function buildServiceRow(meta: SpinMeta, service: ServiceDef, psByService: Map<string, ComposePsRow>): Promise<ServiceRow> {
    const tempoNote = service.id === "tempo" ? `OTLP receiver on :${effectivePort(meta, "tempo")}` : undefined;
    return {
        id: service.id,
        label: service.label,
        category: service.category,
        kind: service.kind,
        url: serviceUrl(meta, service),
        directUrl: serviceDirectUrl(meta, service),
        status: await serviceStatus(meta, service, psByService),
        note: tempoNote,
    };
}

async function buildTenantRows(meta: SpinMeta): Promise<TenantRow[]> {
    const caddyHttps = effectivePort(meta, "caddyHttps");
    if (caddyHttps === null) return [];
    return Promise.all(
        DEMO_TENANTS.map(
            async (tenant): Promise<TenantRow> => ({
                slug: tenant.slug,
                name: tenant.name,
                adminUrl: `https://${tenant.slug}.admin.${meta.slug}.spin.localhost:${caddyHttps}/`,
                webUrl: `https://${tenant.slug}.web.${meta.slug}.spin.localhost:${caddyHttps}/`,
                adminStatus: (await probeTenantViaCaddy(meta, tenant.slug, "admin")) ? "up" : "down",
            }),
        ),
    );
}

export async function buildSnapshot(meta: SpinMeta): Promise<SandboxSnapshot> {
    const ps = await composePs(buildComposeOptions(meta));
    const psByService = new Map<string, ComposePsRow>();
    for (const row of ps) psByService.set(row.Service, row);

    const [services, tenants, queuePid, activity] = await Promise.all([
        Promise.all(SERVICES.map((service) => buildServiceRow(meta, service, psByService))),
        buildTenantRows(meta),
        readPid(meta.worktreePath, "queue"),
        runActivity(meta.slug),
    ]);

    return {
        slug: meta.slug,
        branch: meta.branch,
        composeProject: meta.composeProject,
        worktreePath: meta.worktreePath,
        worktreeExists: existsSync(meta.worktreePath),
        dashboardUrl: dashboardUrl(meta),
        pr: meta.prNumber ?? null,
        prUrl: meta.prUrl ?? null,
        ports: meta.ports,
        services,
        tenants,
        queueWorker: {
            pid: queuePid,
            status: queuePid !== null && isPidAlive(queuePid) ? "up" : "down",
        },
        run:
            activity.kind === "none"
                ? { kind: "none" }
                : { kind: activity.kind, step: describeRunStep(activity.state), error: activity.state.error },
        glitchtipDsn: meta.glitchtipDsn ?? null,
        legacyDevUi: isLegacyDevUi(meta),
        generatedAt: new Date().toISOString(),
    };
}
