import { useEffect, useState } from "react";
import type { StatusPayload } from "./types";

/**
 * Panel React tree. Phase 0 is intentionally thin — its job is to *prove* the bundling
 * pipeline: this component renders from `dist/agent/client.js`, which has React 19 inlined
 * (no `esm.sh`, no import map). Phase 6 grows this into the full mission-control dashboard
 * (service grid, per-tenant cards, Grafana/Prometheus/Loki links, SSE logs, actions).
 */

function statusDot(ok: boolean): string {
    return ok ? "spin-dot spin-dot--ok" : "spin-dot spin-dot--bad";
}

export function Dashboard() {
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetch("/api/status")
            .then((response) => response.json() as Promise<StatusPayload>)
            .then((payload) => {
                if (active) setStatus(payload);
            })
            .catch((cause: unknown) => {
                if (active) setError(cause instanceof Error ? cause.message : String(cause));
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="spin-shell">
            <header className="spin-header">
                <strong>spin</strong>
                <span className="spin-badge">{status ? `· ${status.slug}` : "· connecting…"}</span>
            </header>

            <div className="spin-card">
                <h2>Panel</h2>
                <p>
                    This panel's React is served from a <strong>bundled module</strong> — no CDN, no import map.
                </p>
                {error ? <p style={{ color: "var(--bad)" }}>status error: {error}</p> : null}
                {status ? (
                    <dl className="spin-kv">
                        <dt>slug</dt>
                        <dd>{status.slug}</dd>
                        <dt>health</dt>
                        <dd>
                            <span className={statusDot(status.ok)} />
                            {status.ok ? "serving" : "down"}
                        </dd>
                        <dt>phase</dt>
                        <dd>{status.phase}</dd>
                        <dt>spin version</dt>
                        <dd>
                            <code>{status.version}</code>
                        </dd>
                    </dl>
                ) : (
                    <p className="spin-boot">loading status…</p>
                )}
            </div>
        </div>
    );
}
