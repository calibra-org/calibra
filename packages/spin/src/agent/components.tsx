import { useMemo, useState } from "react";
import { useAction, useLogStream, useStatus } from "./hooks";
import type { SandboxSnapshot, ServiceRow, ServiceStatus, TenantRow } from "./types";

/**
 * The web-panel React tree, rendered from the bundled `dist/agent/client.js` (React 19 inlined, no
 * CDN). It consumes the same {@link SandboxSnapshot} as the CLI + TUI. Sections: a header with the
 * run banner, a per-tenant panel (so operators don't land on the "unknown shop" apex), a service
 * grid grouped by category, a live log viewer (SSE), and an actions panel (restart/reseed/migrate
 * behind confirms).
 */

const CATEGORY_ORDER = ["app", "edge", "datastore", "observability", "tooling"] as const;
const CATEGORY_LABEL: Record<string, string> = {
    app: "Apps",
    edge: "Edge",
    datastore: "Datastores",
    observability: "Observability",
    tooling: "Dev tools",
};

function statusClass(status: ServiceStatus): string {
    return status === "up" ? "ok" : status === "down" ? "bad" : "warn";
}

function Dot({ status }: { status: ServiceStatus }) {
    return <span className={`spin-dot spin-dot--${statusClass(status)}`} />;
}

function Header({ snapshot, error }: { snapshot: SandboxSnapshot | null; error: string | null }) {
    return (
        <header className="spin-header">
            <strong>spin</strong>
            <span className="spin-badge">{snapshot ? snapshot.slug : "connecting…"}</span>
            {snapshot ? <span className="spin-badge spin-dim">{snapshot.branch}</span> : null}
            {error ? <span className="spin-badge spin-bad">offline: {error}</span> : null}
            {snapshot && snapshot.run.kind !== "none" ? (
                <span className={`spin-badge ${snapshot.run.kind === "failed" ? "spin-bad" : "spin-warn"}`}>
                    {snapshot.run.kind}
                    {snapshot.run.step ? ` · ${snapshot.run.step}` : ""}
                </span>
            ) : null}
        </header>
    );
}

function TenantPanel({ tenants }: { tenants: TenantRow[] }) {
    if (tenants.length === 0) return null;
    return (
        <section className="spin-card">
            <h2>Shops</h2>
            <p className="spin-dim">The bare admin/web apex is the platform "unknown shop" page — open a seeded shop:</p>
            <div className="spin-grid">
                {tenants.map((tenant) => (
                    <div key={tenant.slug} className="spin-tenant">
                        <div className="spin-tenant__head">
                            <Dot status={tenant.adminStatus} />
                            <strong>{tenant.name}</strong>
                        </div>
                        <a href={tenant.adminUrl} target="_blank" rel="noreferrer">
                            admin →
                        </a>
                        <a href={tenant.webUrl} target="_blank" rel="noreferrer">
                            storefront →
                        </a>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ServiceItem({ service }: { service: ServiceRow }) {
    const href = service.url && service.url.startsWith("http") ? service.url : undefined;
    return (
        <div className="spin-svc">
            <Dot status={service.status} />
            {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                    {service.label}
                </a>
            ) : (
                <span>{service.label}</span>
            )}
            {service.url && !href ? <code className="spin-dim">{service.url}</code> : null}
            {service.note ? <span className="spin-dim spin-svc__note">{service.note}</span> : null}
        </div>
    );
}

function ServicesGrid({ services }: { services: ServiceRow[] }) {
    const byCategory = useMemo(() => {
        const map = new Map<string, ServiceRow[]>();
        for (const service of services) {
            const list = map.get(service.category) ?? [];
            list.push(service);
            map.set(service.category, list);
        }
        return map;
    }, [services]);

    return (
        <section className="spin-card">
            <h2>Services</h2>
            {CATEGORY_ORDER.map((category) => {
                const list = byCategory.get(category);
                if (!list || list.length === 0) return null;
                return (
                    <div key={category} className="spin-svc-group">
                        <div className="spin-svc-group__title">{CATEGORY_LABEL[category] ?? category}</div>
                        <div className="spin-svc-group__items">
                            {list.map((service) => (
                                <ServiceItem key={service.id} service={service} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

const LOG_STREAMS = ["api.ndjson", "api", "admin", "web", "platform", "queue", "agent", "db", "redis", "caddy", "grafana"];

function LogViewer() {
    const [stream, setStream] = useState<string>("api.ndjson");
    const { lines } = useLogStream(stream);
    return (
        <section className="spin-card">
            <h2>Logs</h2>
            <div className="spin-log-bar">
                {LOG_STREAMS.map((name) => (
                    <button
                        key={name}
                        type="button"
                        className={name === stream ? "spin-chip spin-chip--on" : "spin-chip"}
                        onClick={() => setStream(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>
            <pre className="spin-log">{lines.length ? lines.join("\n") : "waiting for output…"}</pre>
        </section>
    );
}

function ActionButton({ label, danger, onConfirm }: { label: string; danger?: boolean; onConfirm: () => void }) {
    const [armed, setArmed] = useState(false);
    if (!armed) {
        return (
            <button type="button" className={danger ? "spin-btn spin-btn--danger" : "spin-btn"} onClick={() => setArmed(true)}>
                {label}
            </button>
        );
    }
    return (
        <span className="spin-confirm">
            confirm {label}?
            <button
                type="button"
                className="spin-btn spin-btn--danger"
                onClick={() => {
                    setArmed(false);
                    onConfirm();
                }}
            >
                yes
            </button>
            <button type="button" className="spin-btn" onClick={() => setArmed(false)}>
                no
            </button>
        </span>
    );
}

function ActionsPanel({ services }: { services: ServiceRow[] }) {
    const { state, run, reset } = useAction();
    const [restartTarget, setRestartTarget] = useState<string>(services[0]?.id ?? "api");
    return (
        <section className="spin-card">
            <h2>Actions</h2>
            <div className="spin-actions">
                <span className="spin-action-row">
                    restart
                    <select value={restartTarget} onChange={(event) => setRestartTarget(event.target.value)}>
                        {services.map((service) => (
                            <option key={service.id} value={service.id}>
                                {service.label}
                            </option>
                        ))}
                    </select>
                    <ActionButton label="restart" onConfirm={() => run("restart", restartTarget)} />
                </span>
                <ActionButton label="re-seed db" danger onConfirm={() => run("reseed")} />
                <ActionButton label="migrate db" danger onConfirm={() => run("migrate")} />
                {state.lines.length > 0 || state.running ? (
                    <button type="button" className="spin-btn" onClick={reset}>
                        clear
                    </button>
                ) : null}
            </div>
            {state.lines.length > 0 || state.running ? (
                <pre className="spin-log spin-log--action">
                    {state.lines.join("\n")}
                    {state.running ? "\n…" : state.ok === false ? "\n✗ failed" : state.done ? "\n✓ done" : ""}
                </pre>
            ) : null}
        </section>
    );
}

export function Dashboard() {
    const { snapshot, error } = useStatus();
    return (
        <div className="spin-shell">
            <Header snapshot={snapshot} error={error} />
            {snapshot ? (
                <>
                    <TenantPanel tenants={snapshot.tenants} />
                    <ServicesGrid services={snapshot.services} />
                    <LogViewer />
                    <ActionsPanel services={snapshot.services} />
                </>
            ) : (
                <p className="spin-boot">loading snapshot…</p>
            )}
        </div>
    );
}
