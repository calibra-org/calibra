"use client";

import { useTranslations } from "next-intl";

import { StatusPill } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { TriangleAlert } from "#/icons";
import { useAudit } from "#/lib/queries";

/**
 * Control-plane audit feed — merged operator actions + impersonation sessions, newest-first. Scoped
 * to one tenant when `tenantId` is given (the shop-detail tab), otherwise fleet-wide.
 */
export function AuditView({ tenantId }: { tenantId?: string }) {
    const t = useTranslations("Audit");
    const tc = useTranslations("Common");
    const audit = useAudit(tenantId);

    if (audit.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;
    if (audit.isError || !audit.data) {
        return (
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
    }
    if (audit.data.data.length === 0) {
        return <EmptyState icon={TriangleAlert} title={t("empty")} />;
    }

    return (
        <div className="mission-panel overflow-hidden">
            <Table className="console-table">
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("when")}</TableHead>
                        <TableHead>{t("action")}</TableHead>
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
                            <TableCell>
                                <StatusPill tone={e.source === "impersonation" ? "warning" : "info"}>{e.action}</StatusPill>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                                {e.platform_user_id ? `#${e.platform_user_id}` : "—"}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{e.reason ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
