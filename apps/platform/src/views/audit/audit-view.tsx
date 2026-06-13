"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { ConsoleSelect } from "#/components/ConsoleSelect";
import { StatusPill } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { TriangleAlert } from "#/icons";
import { useAudit, useTenants } from "#/lib/queries";
import type { AuditEvent } from "#/lib/types";

/**
 * i18n key per audit `action` value (the `platform_audit_events` actions + the `impersonation`
 * pseudo-action from `tenant_impersonation_events`). `satisfies` keeps this a closed, exhaustive map
 * — add a server action and the compiler forces a matching label key here. Unknown/legacy actions
 * fall back to the raw string so the feed never renders blank.
 */
const AUDIT_ACTION_KEYS = {
    impersonation: "action_impersonation",
    tenant_provisioned: "action_tenant_provisioned",
    tenant_updated: "action_tenant_updated",
    domain_added: "action_domain_added",
    domain_removed: "action_domain_removed",
    operator_created: "action_operator_created",
    operator_disabled: "action_operator_disabled",
    operator_enabled: "action_operator_enabled",
    operator_removed: "action_operator_removed",
    password_rotated: "action_password_rotated",
    handoff_link_issued: "action_handoff_link_issued",
    ownership_transferred: "action_ownership_transferred",
} as const satisfies Record<string, string>;

type AuditAction = keyof typeof AUDIT_ACTION_KEYS;

function isAuditAction(action: string): action is AuditAction {
    return action in AUDIT_ACTION_KEYS;
}

/** A string field off the (untyped) metadata bag, or null. */
function metaString(metadata: AuditEvent["metadata"], key: string): string | null {
    const value = (metadata as Record<string, unknown> | undefined)?.[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The most informative "subject" of an event for the details column — the domain, the affected
 * operator's email, the provisioned slug, or a `#id` fallback for the impersonated user. Returns null
 * when there's nothing meaningful to show (rendered as an em dash).
 */
function auditSubject(e: AuditEvent): string | null {
    return (
        metaString(e.metadata, "domain") ??
        e.target_email ??
        metaString(e.metadata, "email") ??
        metaString(e.metadata, "slug") ??
        (e.target_user_id ? `#${e.target_user_id}` : null)
    );
}

/** Readable label for the acting platform operator (resolved name → email → `#id` → em dash). */
function operatorLabel(e: AuditEvent): string {
    return e.platform_user_name ?? e.platform_user_email ?? (e.platform_user_id ? `#${e.platform_user_id}` : "—");
}

/** Shop label for the fleet feed (resolved name → slug → `#id`). */
function shopLabel(e: AuditEvent): string {
    return e.tenant_name ?? e.tenant_slug ?? `#${e.tenant_id}`;
}

/** Fleet-only "shop" filter — a select of the shops, plus an "all shops" option. */
function ShopFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const t = useTranslations("Audit");
    const tenants = useTenants({ page: 1 });
    const options = [
        { value: "", label: t("allShops") },
        ...(tenants.data?.data ?? []).map((shop) => ({ value: String(shop.id), label: shop.name })),
    ];
    return (
        <div className="w-60">
            <ConsoleSelect ariaLabel={t("shop")} value={value} onValueChange={onChange} options={options} />
        </div>
    );
}

/**
 * Control-plane audit feed — merged operator actions + impersonation sessions, newest-first. Scoped
 * to one tenant when `tenantId` is given (the shop-detail tab); otherwise fleet-wide, where it gains
 * a shop column + a shop filter.
 */
export function AuditView({ tenantId }: { tenantId?: string }) {
    const t = useTranslations("Audit");
    const tc = useTranslations("Common");
    const fleet = tenantId === undefined;
    const [shopFilter, setShopFilter] = useState("");
    const effectiveTenant = tenantId ?? (shopFilter || undefined);
    const audit = useAudit(effectiveTenant);

    /** Localized, human-readable label for an audit action (raw string fallback for unknown ones). */
    const actionLabel = (action: string): string =>
        isAuditAction(action) ? t(AUDIT_ACTION_KEYS[action] as "action_impersonation") : action;

    const filterBar = fleet ? (
        <div className="flex justify-end">
            <ShopFilter value={shopFilter} onChange={setShopFilter} />
        </div>
    ) : null;

    let body: ReactNode;
    if (audit.isPending) {
        body = <Skeleton className="h-64 w-full rounded-lg" />;
    } else if (audit.isError || !audit.data) {
        body = (
            <EmptyState
                icon={TriangleAlert}
                title={tc("errorTitle")}
                description={tc("error")}
                action={
                    <Button variant="outline" onClick={() => audit.refetch()}>
                        {tc("retry")}
                    </Button>
                }
            />
        );
    } else if (audit.data.data.length === 0) {
        body = <EmptyState icon={TriangleAlert} title={t("empty")} />;
    } else {
        body = (
            <div className="mission-panel overflow-hidden">
                <Table className="console-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("when")}</TableHead>
                            {fleet ? <TableHead>{t("shop")}</TableHead> : null}
                            <TableHead>{t("action")}</TableHead>
                            <TableHead>{t("details")}</TableHead>
                            <TableHead>{t("operator")}</TableHead>
                            <TableHead>{t("reason")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {audit.data.data.map((e) => (
                            <TableRow key={`${e.source}-${e.id}`} className="transition-colors hover:bg-accent/40">
                                <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                                    {new Date(e.created_at).toLocaleString()}
                                </TableCell>
                                {fleet ? <TableCell className="font-medium text-sm">{shopLabel(e)}</TableCell> : null}
                                <TableCell>
                                    <StatusPill tone={e.source === "impersonation" ? "warning" : "info"}>
                                        {actionLabel(e.action)}
                                    </StatusPill>
                                </TableCell>
                                <TableCell
                                    dir="ltr"
                                    className="max-w-xs truncate text-start font-mono text-muted-foreground text-sm"
                                >
                                    {auditSubject(e) ?? "—"}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">{operatorLabel(e)}</TableCell>
                                <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                                    {e.reason ?? "—"}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {filterBar}
            {body}
        </div>
    );
}
