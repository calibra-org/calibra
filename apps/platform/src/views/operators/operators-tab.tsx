"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { StatusPill, type PillTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { DialogBody, DialogContent, DialogHeader, DialogRoot, DialogTitle } from "#/components/ui/dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Ban, RefreshCw, ShieldCheck, Trash2, TriangleAlert, UserCheck, UserPlus } from "#/icons";
import {
    useDisableOperator,
    useEnableOperator,
    useMakeOwner,
    useOperators,
    useRemoveOperator,
    useResetOperatorPassword,
} from "#/lib/queries";
import type { Operator } from "#/lib/types";
import { CredentialRevealCard } from "#/views/operators/credential-reveal-card";
import { ImpersonateModal } from "#/views/operators/impersonate-modal";
import { OperatorForm } from "#/views/operators/operator-form";

function statusTone(status: string): PillTone {
    if (status === "active") return "success";
    if (status === "disabled") return "danger";
    return "neutral";
}

export function OperatorsTab({ id }: { id: string }) {
    const t = useTranslations("Operators");
    const tc = useTranslations("Common");
    const operators = useOperators(id);
    const disable = useDisableOperator(id);
    const enable = useEnableOperator(id);
    const remove = useRemoveOperator(id);
    const makeOwner = useMakeOwner(id);
    const reset = useResetOperatorPassword(id);

    const [addOpen, setAddOpen] = useState(false);
    const [impersonate, setImpersonate] = useState<{ userId: number; name: string } | null>(null);
    const [resetReveal, setResetReveal] = useState<{ email: string; tempPassword: string } | null>(null);

    async function onReset(op: Operator) {
        const res = await reset.mutateAsync(op.id);
        setResetReveal({ email: op.email ?? "", tempPassword: res.temp_password });
    }

    if (operators.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;
    if (operators.isError || !operators.data) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title={tc("errorTitle")}
                description={tc("error")}
                action={
                    <Button variant="outline" onClick={() => operators.refetch()}>
                        {tc("retry")}
                    </Button>
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end">
                <Button onClick={() => setAddOpen(true)}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    {t("add")}
                </Button>
            </div>

            <div className="mission-panel overflow-hidden">
                <Table className="console-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("name")}</TableHead>
                            <TableHead>{t("email")}</TableHead>
                            <TableHead>{t("status")}</TableHead>
                            <TableHead>{t("lastLogin")}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {operators.data.map((op) => {
                            const c = op.capabilities;
                            return (
                                <TableRow key={op.id} className="transition-colors hover:bg-accent/40">
                                    <TableCell className="font-medium">
                                        <span className="flex items-center gap-2">
                                            {op.name}
                                            {op.is_store_owner ? (
                                                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
                                                    <ShieldCheck className="size-3" aria-hidden="true" />
                                                    {t("owner")}
                                                </span>
                                            ) : null}
                                        </span>
                                    </TableCell>
                                    <TableCell dir="ltr" className="font-mono text-muted-foreground text-sm">
                                        {op.email}
                                    </TableCell>
                                    <TableCell>
                                        <StatusPill tone={statusTone(op.status)}>{t(`status_${op.status}` as "status_active")}</StatusPill>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {op.last_login_at ? new Date(op.last_login_at).toLocaleDateString() : t("never")}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            {c.can_login_as ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("loginAs")}
                                                    onClick={() => setImpersonate({ userId: op.id, name: op.name })}
                                                >
                                                    <UserCheck className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_reset_password ? (
                                                <Button variant="ghost" size="icon" aria-label={t("resetPassword")} onClick={() => onReset(op)}>
                                                    <RefreshCw className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_make_owner ? (
                                                <Button variant="ghost" size="icon" aria-label={t("makeOwner")} onClick={() => makeOwner.mutate(op.id)}>
                                                    <ShieldCheck className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_disable ? (
                                                <Button variant="ghost" size="icon" aria-label={t("disable")} onClick={() => disable.mutate(op.id)}>
                                                    <Ban className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_enable ? (
                                                <Button variant="ghost" size="icon" aria-label={t("enable")} onClick={() => enable.mutate(op.id)}>
                                                    <UserCheck className="size-4 text-success" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_remove ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("remove")}
                                                    onClick={() => {
                                                        if (window.confirm(t("removeConfirm", { name: op.name }))) remove.mutate(op.id);
                                                    }}
                                                >
                                                    <Trash2 className="size-4 text-danger" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <OperatorForm tenantId={id} open={addOpen} onOpenChange={setAddOpen} />
            <ImpersonateModal
                tenantId={id}
                targetUserId={impersonate?.userId ?? null}
                targetName={impersonate?.name}
                open={impersonate !== null}
                onOpenChange={(v) => !v && setImpersonate(null)}
            />
            <DialogRoot open={resetReveal !== null} onOpenChange={(v) => !v && setResetReveal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("resetTitle")}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        {resetReveal ? (
                            <CredentialRevealCard email={resetReveal.email} tempPassword={resetReveal.tempPassword} />
                        ) : null}
                    </DialogBody>
                </DialogContent>
            </DialogRoot>
        </div>
    );
}
