"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogRoot, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Link2, RefreshCw, ShieldCheck, Trash2, UserCheck, UserPlus, UserX } from "#/icons";
import {
    type Operator,
    type OperatorCredentialReveal,
    useAdminOperatorHandoffLink,
    useAdminOperators,
    useCreateAdminOperator,
    useDisableAdminOperator,
    useEnableAdminOperator,
    useMakeAdminOwner,
    useRemoveAdminOperator,
    useResetAdminOperatorPassword,
} from "#/lib/queries/operators";
import { CredentialRevealCard } from "#/views/settings/team/credential-reveal-card";

function statusTone(status: string): StatusTone {
    if (status === "active") return "success";
    if (status === "disabled") return "danger";
    return "neutral";
}

/**
 * Settings ▸ Team — owner-only operator management. Mutations are owner-gated server-side; the
 * per-row capabilities drive which actions render, so non-owners see a read-only roster.
 */
export function TeamSettings() {
    const t = useTranslations("Team");
    const operators = useAdminOperators();
    const create = useCreateAdminOperator();
    const disable = useDisableAdminOperator();
    const enable = useEnableAdminOperator();
    const remove = useRemoveAdminOperator();
    const makeOwner = useMakeAdminOwner();
    const reset = useResetAdminOperatorPassword();
    const handoff = useAdminOperatorHandoffLink();

    const [addOpen, setAddOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [useHandoff, setUseHandoff] = useState(false);
    const [reveal, setReveal] = useState<{ email?: string | null; cred: OperatorCredentialReveal } | null>(null);

    async function onAdd(e: FormEvent) {
        e.preventDefault();
        const res = await create.mutateAsync({ email, handoff: useHandoff });
        setReveal({ email, cred: res.credentials });
        setEmail("");
        setUseHandoff(false);
        setAddOpen(false);
    }

    async function onReset(op: Operator) {
        const res = await reset.mutateAsync(op.id);
        setReveal({ email: op.email, cred: { temp_password: res.data.temp_password, handoff_url: null } });
    }

    async function onHandoff(op: Operator) {
        const res = await handoff.mutateAsync(op.id);
        setReveal({ email: op.email, cred: { temp_password: null, handoff_url: res.data.handoff_url } });
    }

    if (operators.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;
    if (operators.isError || !operators.data) {
        return <p className="text-danger text-sm">{t("loadError")}</p>;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end">
                {operators.data.some((o) => o.capabilities.can_reset_password) ? (
                    <Button onClick={() => setAddOpen(true)}>
                        <UserPlus className="size-4" aria-hidden="true" />
                        {t("add")}
                    </Button>
                ) : null}
            </div>

            {reveal ? (
                <CredentialRevealCard
                    email={reveal.email}
                    tempPassword={reveal.cred.temp_password}
                    handoffUrl={reveal.cred.handoff_url}
                />
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("name")}</TableHead>
                            <TableHead>{t("email")}</TableHead>
                            <TableHead>{t("status")}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {operators.data.map((op) => {
                            const c = op.capabilities;
                            return (
                                <TableRow key={op.id}>
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
                                        <StatusBadge tone={statusTone(op.status)}>
                                            {t(`status_${op.status}` as "status_active")}
                                        </StatusBadge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            {c.can_reset_password ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("resetPassword")}
                                                    onClick={() => onReset(op)}
                                                >
                                                    <RefreshCw className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_reset_password ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("handoffLink")}
                                                    onClick={() => onHandoff(op)}
                                                >
                                                    <Link2 className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_make_owner ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("makeOwner")}
                                                    onClick={() => makeOwner.mutate(op.id)}
                                                >
                                                    <ShieldCheck className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_disable ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("disable")}
                                                    onClick={() => disable.mutate(op.id)}
                                                >
                                                    <UserX className="size-4" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_enable ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("enable")}
                                                    onClick={() => enable.mutate(op.id)}
                                                >
                                                    <UserCheck className="size-4 text-success" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                            {c.can_remove ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("remove")}
                                                    onClick={() => {
                                                        if (window.confirm(t("removeConfirm", { name: op.name })))
                                                            remove.mutate(op.id);
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

            <DialogRoot open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("addTitle")}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <form id="team-add" onSubmit={onAdd} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="team-email">{t("email")}</Label>
                                <Input
                                    id="team-email"
                                    type="email"
                                    dir="ltr"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <Label htmlFor="team-handoff" className="flex items-center gap-2 font-normal text-sm">
                                <Checkbox
                                    id="team-handoff"
                                    checked={useHandoff}
                                    onCheckedChange={(v) => setUseHandoff(Boolean(v))}
                                />
                                {t("sendHandoff")}
                            </Label>
                        </form>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="submit" form="team-add" disabled={create.isPending || email.length === 0}>
                            {t("addSubmit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </DialogRoot>
        </div>
    );
}
