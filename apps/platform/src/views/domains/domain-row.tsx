"use client";

import { useTranslations } from "next-intl";

import { StatusPill, type PillTone, tlsStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { Check, RefreshCw, Trash2, TriangleAlert, X } from "#/icons";
import { CopyField } from "#/views/operators/credential-reveal-card";
import type { TenantDomain } from "#/lib/types";
import { cn } from "#/lib/utils";

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A verification gate chip — ticked when the gate has passed, muted "pending" otherwise. */
function Gate({ label, done }: { label: string; done: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
                done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
            )}
        >
            {done ? <Check className="size-3" aria-hidden="true" /> : <X className="size-3" aria-hidden="true" />}
            {label}
        </span>
    );
}

/**
 * One custom/subdomain row in the domains tab. Renders the two verification gates (ownership +
 * routing), the TLS status, a "simulated (local)" badge, the exact TXT/CNAME records to publish, and
 * the last cert error when failed. Recheck drives the state machine; detach is hidden for the primary.
 */
export function DomainRow({
    domain,
    onRecheck,
    onDetach,
    busy,
}: {
    domain: TenantDomain;
    onRecheck: () => void;
    onDetach: () => void;
    busy: boolean;
}) {
    const t = useTranslations("Domains");
    return (
        <div className="mission-panel flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1.5">
                    <code dir="ltr" className="font-medium font-mono text-sm">
                        {domain.domain}
                    </code>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={tlsStatusTone(domain.tls_status) as PillTone}>
                            {t(`tls${cap(domain.tls_status)}` as "tlsPending")}
                        </StatusPill>
                        {domain.kind === "custom" ? (
                            <>
                                <Gate label={t("gateOwnership")} done={domain.ownership_verified} />
                                <Gate label={t("gateRouting")} done={domain.routing_verified} />
                            </>
                        ) : (
                            <span className="text-muted-foreground text-xs">{t("kindSubdomain")}</span>
                        )}
                        {domain.simulated ? (
                            <span className="rounded-md bg-info/10 px-2 py-0.5 text-info text-xs">{t("simulated")}</span>
                        ) : null}
                    </div>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={t("recheck")} disabled={busy} onClick={onRecheck}>
                        <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />
                    </Button>
                    {!domain.is_primary ? (
                        <Button variant="ghost" size="icon" aria-label={t("detach")} disabled={busy} onClick={onDetach}>
                            <Trash2 className="size-4 text-danger" aria-hidden="true" />
                        </Button>
                    ) : null}
                </div>
            </div>

            {domain.cert_last_error ? (
                <div className="flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-danger text-xs">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    {domain.cert_last_error}
                </div>
            ) : null}

            {domain.kind === "custom" && !(domain.ownership_verified && domain.routing_verified) ? (
                <div className="flex flex-col gap-2 border-border border-t pt-3">
                    <p className="text-muted-foreground text-xs">{t("recordsHint")}</p>
                    {domain.ownership.record_value ? (
                        <CopyField
                            label={`${domain.ownership.record_type} · ${domain.ownership.record_name}`}
                            value={domain.ownership.record_value}
                        />
                    ) : null}
                    {domain.routing.record_value ? (
                        <CopyField
                            label={`${domain.routing.record_type} · ${domain.routing.record_name}`}
                            value={domain.routing.record_value}
                        />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
