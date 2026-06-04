"use client";

import { useTranslations } from "next-intl";

/**
 * Embedded Grafana panel for a tenant's operational metrics (RULE D — infra metrics stay in
 * Grafana, not rebuilt natively). Builds the iframe `src` from `NEXT_PUBLIC_GRAFANA_BASE` +
 * dashboard uid + `var-tenant=<id>`. Phase 6 wires the actual dashboard + the `tenant` template
 * variable; here we render the slot and a placeholder when the base URL isn't configured.
 */
export function GrafanaEmbed({ tenantId }: { tenantId: number }) {
    const t = useTranslations("Metrics");
    const base = process.env.NEXT_PUBLIC_GRAFANA_BASE;
    const uid = process.env.NEXT_PUBLIC_GRAFANA_TENANT_DASHBOARD_UID ?? "tenant-ops";

    if (!base) {
        return (
            <div className="grid h-64 place-items-center rounded-lg border border-border border-dashed bg-muted/30 text-center text-muted-foreground text-sm">
                {t("grafanaMissing")}
            </div>
        );
    }

    const src = `${base.replace(/\/+$/, "")}/d/${uid}?orgId=1&kiosk&theme=light&var-tenant=${tenantId}`;
    return (
        <iframe
            title={t("opsPanel")}
            src={src}
            className="h-64 w-full rounded-lg border border-border"
            sandbox="allow-scripts allow-same-origin"
        />
    );
}
