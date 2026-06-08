import { DB_ROLES } from "./secrets";
import type { PortRole } from "./ports";

/**
 * The services catalog — the single source of truth for what a spin runs. Encoded as a typed
 * TypeScript module (not YAML) so it needs no parser dependency and stays type-checked against
 * {@link PortRole}. It drives the Caddyfile render (Phase 2), the snapshot/probes (Phase 5), the
 * handoff card, and the panels. `services-config.test.ts` pins its internal consistency.
 *
 * Calibra runs **datastores + observability as containers** and **all apps as host HMR
 * processes** (api/queue/admin/web/platform/agent). Caddy fronts everything over local TLS at
 * `<sub>.<slug>.spin.localhost`; host apps are reached via `host.docker.internal:<port>`.
 */

export { DB_ROLES };

export type ServiceCategory = "app" | "datastore" | "observability" | "edge" | "tooling";
export type ServiceKind = "container" | "host";

/** How Caddy reverse-proxies a service. */
export interface CaddyRoute {
    /** Subdomain label; `""` is the apex `<slug>.spin.localhost`. e.g. `api`, `grafana`, `console`. */
    subdomain: string;
    /**
     * Upstream target. `"host"` → `host.docker.internal:<the service's host port>` (host HMR apps);
     * otherwise a container `service:port` reached over the spin's compose network.
     */
    upstream: "host" | { service: string; port: number };
    /**
     * Also emit a per-tenant wildcard (`*.<subdomain>.<slug>.spin.localhost`) and explicit
     * per-seeded-tenant blocks. Only the multi-tenant surfaces (admin, web) set this.
     */
    tenantWildcard?: boolean;
}

/** How a service's health is probed (Phase 5 consumes this). */
export interface HealthProbe {
    kind: "tcp" | "http" | "process";
    /** HTTP path for `kind: "http"` (probed via Caddy for container services, direct for host apps). */
    path?: string;
    /** HTTP statuses to accept as healthy beyond 2xx (e.g. GlitchTip returns 401/403 when up). */
    acceptStatuses?: number[];
    /** Probe the HTTP path through Caddy (true) or directly at the host port (false). */
    viaCaddy?: boolean;
}

export interface ServiceDef {
    /** Stable id, used as the snapshot row key and the log-stream name. */
    id: string;
    label: string;
    category: ServiceCategory;
    kind: ServiceKind;
    /** Port role from {@link PortRole}. Absent for portless services (queue, promtail, glitchtip-worker). */
    portRole?: PortRole;
    /** docker-compose service name (container kind only). */
    composeService?: string;
    /** Whether the container publishes its host port (vs container-only, reached only via Caddy). */
    published?: boolean;
    caddy?: CaddyRoute;
    health: HealthProbe;
}

/**
 * The full service set. Order is the operator-facing display order (apps first, then edge,
 * datastores, observability, tooling).
 */
export const SERVICES: ServiceDef[] = [
    {
        id: "api",
        label: "API",
        category: "app",
        kind: "host",
        portRole: "api",
        caddy: { subdomain: "api", upstream: "host" },
        health: { kind: "http", path: "/health", viaCaddy: false },
    },
    {
        id: "queue",
        label: "Queue worker",
        category: "app",
        kind: "host",
        health: { kind: "process" },
    },
    {
        id: "admin",
        label: "Admin",
        category: "app",
        kind: "host",
        portRole: "admin",
        caddy: { subdomain: "admin", upstream: "host", tenantWildcard: true },
        health: { kind: "http", path: "/", viaCaddy: false },
    },
    {
        id: "web",
        label: "Storefront",
        category: "app",
        kind: "host",
        portRole: "web",
        caddy: { subdomain: "web", upstream: "host", tenantWildcard: true },
        health: { kind: "http", path: "/", viaCaddy: false },
    },
    {
        id: "platform",
        label: "Platform console",
        category: "app",
        kind: "host",
        portRole: "platform",
        caddy: { subdomain: "console", upstream: "host" },
        health: { kind: "http", path: "/", viaCaddy: false },
    },
    {
        id: "agent",
        label: "Spin panel",
        category: "app",
        kind: "host",
        portRole: "spinAgent",
        caddy: { subdomain: "", upstream: "host" },
        health: { kind: "http", path: "/api/status", viaCaddy: false },
    },
    {
        id: "caddy",
        label: "Caddy",
        category: "edge",
        kind: "container",
        composeService: "caddy",
        portRole: "caddyHttps",
        published: true,
        health: { kind: "tcp" },
    },
    {
        id: "db",
        label: "Postgres",
        category: "datastore",
        kind: "container",
        composeService: "db",
        portRole: "db",
        published: true,
        health: { kind: "tcp" },
    },
    {
        id: "redis",
        label: "Redis",
        category: "datastore",
        kind: "container",
        composeService: "redis",
        portRole: "redis",
        published: true,
        health: { kind: "tcp" },
    },
    {
        id: "meilisearch",
        label: "Meilisearch",
        category: "datastore",
        kind: "container",
        composeService: "meilisearch",
        portRole: "meilisearch",
        published: true,
        caddy: { subdomain: "search", upstream: { service: "meilisearch", port: 7700 } },
        health: { kind: "http", path: "/health", viaCaddy: false },
    },
    {
        id: "prometheus",
        label: "Prometheus",
        category: "observability",
        kind: "container",
        composeService: "prometheus",
        portRole: "prometheus",
        caddy: { subdomain: "prom", upstream: { service: "prometheus", port: 9090 } },
        health: { kind: "http", path: "/-/healthy", viaCaddy: true },
    },
    {
        id: "grafana",
        label: "Grafana",
        category: "observability",
        kind: "container",
        composeService: "grafana",
        portRole: "grafana",
        caddy: { subdomain: "grafana", upstream: { service: "grafana", port: 3000 } },
        health: { kind: "http", path: "/api/health", viaCaddy: true },
    },
    {
        id: "loki",
        label: "Loki",
        category: "observability",
        kind: "container",
        composeService: "loki",
        portRole: "loki",
        caddy: { subdomain: "loki", upstream: { service: "loki", port: 3100 } },
        health: { kind: "http", path: "/ready", viaCaddy: true },
    },
    {
        id: "tempo",
        label: "Tempo",
        category: "observability",
        kind: "container",
        composeService: "tempo",
        portRole: "tempo",
        published: true,
        caddy: { subdomain: "tempo", upstream: { service: "tempo", port: 3200 } },
        health: { kind: "http", path: "/ready", viaCaddy: true },
    },
    {
        id: "alertmanager",
        label: "Alertmanager",
        category: "observability",
        kind: "container",
        composeService: "alertmanager",
        portRole: "alertmanager",
        caddy: { subdomain: "alerts", upstream: { service: "alertmanager", port: 9093 } },
        health: { kind: "http", path: "/-/healthy", viaCaddy: true },
    },
    {
        id: "glitchtip",
        label: "GlitchTip",
        category: "observability",
        kind: "container",
        composeService: "glitchtip",
        portRole: "glitchtip",
        caddy: { subdomain: "errors", upstream: { service: "glitchtip", port: 8000 } },
        health: { kind: "http", path: "/api/0/", acceptStatuses: [401, 403], viaCaddy: true },
    },
    {
        id: "glitchtip-worker",
        label: "GlitchTip worker",
        category: "observability",
        kind: "container",
        composeService: "glitchtip-worker",
        health: { kind: "process" },
    },
    {
        id: "promtail",
        label: "Promtail",
        category: "observability",
        kind: "container",
        composeService: "promtail",
        health: { kind: "process" },
    },
    {
        id: "uptimekuma",
        label: "Uptime Kuma",
        category: "observability",
        kind: "container",
        composeService: "uptimekuma",
        portRole: "uptimeKuma",
        caddy: { subdomain: "uptime", upstream: { service: "uptimekuma", port: 3001 } },
        health: { kind: "http", path: "/", acceptStatuses: [302], viaCaddy: true },
    },
    {
        id: "pgadmin",
        label: "pgAdmin",
        category: "tooling",
        kind: "container",
        composeService: "pgadmin",
        portRole: "pgadmin",
        published: true,
        health: { kind: "tcp" },
    },
    {
        id: "adminer",
        label: "Adminer",
        category: "tooling",
        kind: "container",
        composeService: "adminer",
        portRole: "adminer",
        published: true,
        caddy: { subdomain: "db", upstream: { service: "adminer", port: 8080 } },
        health: { kind: "tcp" },
    },
    {
        id: "redisinsight",
        label: "RedisInsight",
        category: "tooling",
        kind: "container",
        composeService: "redisinsight",
        portRole: "redisinsight",
        published: true,
        caddy: { subdomain: "redis", upstream: { service: "redisinsight", port: 5540 } },
        health: { kind: "tcp" },
    },
    {
        id: "mailpit",
        label: "Mailpit",
        category: "tooling",
        kind: "container",
        composeService: "mailpit",
        portRole: "mailpitWeb",
        published: true,
        caddy: { subdomain: "mail", upstream: { service: "mailpit", port: 8025 } },
        health: { kind: "tcp" },
    },
];

/** Look up a service definition by id. */
export function serviceById(id: string): ServiceDef | undefined {
    return SERVICES.find((service) => service.id === id);
}

/** Host-process services (apps), in display order. */
export const HOST_SERVICES = SERVICES.filter((service) => service.kind === "host");

/** Container services, in display order. */
export const CONTAINER_SERVICES = SERVICES.filter((service) => service.kind === "container");

export interface DemoTenant {
    slug: string;
    name: string;
    ownerEmail: string;
}

/**
 * The demo tenants seeded by `apps/api/database/seeders/main_seeder.ts`. Kept in lockstep with
 * the seeder — the handoff card, panel, and per-tenant doctor probes enumerate these, so a drift
 * means advertised shop URLs 404. All owners share the password `Passw0rd1!`.
 */
export const DEMO_TENANTS: DemoTenant[] = [
    { slug: "aurora", name: "Aurora", ownerEmail: "admin@bulk.calibra.dev" },
    { slug: "mehr", name: "Mehr", ownerEmail: "admin@mehr.calibra.dev" },
    { slug: "kasra", name: "Kasra", ownerEmail: "admin@kasra.calibra.dev" },
];

/** Shared dev password for every seeded tenant owner. */
export const DEMO_TENANT_PASSWORD = "Passw0rd1!";

/** Platform (control-plane) operator login, seeded alongside the demo tenants. */
export const PLATFORM_LOGIN = { email: "platform@calibra.dev", password: DEMO_TENANT_PASSWORD };

export interface GrafanaDashboard {
    uid: string;
    title: string;
}

/**
 * The committed Grafana dashboards (`docker/observability/grafana/dashboards/*.json`). The panel
 * deep-links each at `https://grafana.<slug>.spin.localhost:<caddyHttps>/d/<uid>/`. Keep in sync
 * with the dashboard JSON `uid` fields.
 */
export const GRAFANA_DASHBOARDS: GrafanaDashboard[] = [
    { uid: "calibra-api-overview", title: "API — request overview" },
    { uid: "calibra-api-by-route", title: "API — by route" },
    { uid: "calibra-node-runtime", title: "API — Node runtime" },
    { uid: "calibra-auth-ratelimits", title: "Auth & rate limits" },
    { uid: "calibra-cache-queue", title: "Cache & queue" },
    { uid: "calibra-orders-inventory", title: "Orders & inventory" },
    { uid: "calibra-checkout-payments", title: "Checkout & payments" },
    { uid: "calibra-imports-exports", title: "CSV imports & exports" },
];
