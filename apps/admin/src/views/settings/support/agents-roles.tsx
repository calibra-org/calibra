"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { type TicketAgent, useCreateTicketAgent, useInboxes, useTicketAgents, useUpdateTicketAgent } from "#/lib/queries/tickets";

type SupportRole = TicketAgent["support_role"];
type AccessTier = TicketAgent["access_tier"];

const ROLE_VALUES: SupportRole[] = ["agent", "supervisor", "support_admin"];
const TIER_VALUES: AccessTier[] = ["all", "unassigned_and_own", "participating"];

/** Support agents roster: role / access-tier / status management plus an add-agent dialog. */
export function AgentsRoles() {
    const t = useTranslations("Settings");
    const { data: agents, isLoading } = useTicketAgents();

    if (isLoading) {
        return <Skeleton className="h-64 w-full rounded-xl" />;
    }

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">{t("support.agents.title")}</CardTitle>
                    <CardDescription>{t("support.agents.subtitle")}</CardDescription>
                </div>
                <AddAgentDialog />
            </CardHeader>
            <CardContent className="pt-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("support.agents.agent")}</TableHead>
                            <TableHead>{t("support.agents.role")}</TableHead>
                            <TableHead>{t("support.agents.tier")}</TableHead>
                            <TableHead>{t("support.agents.reassign")}</TableHead>
                            <TableHead>{t("support.agents.status")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(agents ?? []).length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                                    {t("support.agents.empty")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            (agents ?? []).map((agent) => <AgentRow key={agent.id} agent={agent} t={t} />)
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function AgentRow({ agent, t }: { agent: TicketAgent; t: (key: string) => string }) {
    const update = useUpdateTicketAgent(agent.id);

    return (
        <TableRow>
            <TableCell className="font-medium">{agent.user?.email ?? `#${agent.user_id}`}</TableCell>
            <TableCell>
                <Select value={agent.support_role} onValueChange={(v) => update.mutate({ support_role: v as SupportRole })}>
                    <SelectTrigger className="w-40">
                        <SelectValue>{(value) => t(`support.role.${String(value)}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {ROLE_VALUES.map((role) => (
                            <SelectItem key={role} value={role}>
                                {t(`support.role.${role}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell>
                <Select value={agent.access_tier} onValueChange={(v) => update.mutate({ access_tier: v as AccessTier })}>
                    <SelectTrigger className="w-52">
                        <SelectValue>{(value) => t(`support.tier.${String(value)}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {TIER_VALUES.map((tier) => (
                            <SelectItem key={tier} value={tier}>
                                {t(`support.tier.${tier}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell>
                <Switch checked={agent.can_reassign} onCheckedChange={(checked) => update.mutate({ can_reassign: checked })} />
            </TableCell>
            <TableCell>
                <Switch
                    checked={agent.status === "active"}
                    onCheckedChange={(checked) => update.mutate({ status: checked ? "active" : "disabled" })}
                />
            </TableCell>
        </TableRow>
    );
}

function AddAgentDialog() {
    const t = useTranslations("Settings");
    const create = useCreateTicketAgent();
    const { data: inboxes } = useInboxes();
    const [open, setOpen] = useState(false);
    const [userId, setUserId] = useState("");
    const [role, setRole] = useState<SupportRole>("agent");
    const [tier, setTier] = useState<AccessTier>("unassigned_and_own");
    const [canReassign, setCanReassign] = useState(false);
    const [inboxIds, setInboxIds] = useState<string[]>([]);

    const toggleInbox = (id: string) => {
        setInboxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const submit = async () => {
        if (userId.trim().length === 0) return;
        await create.mutateAsync({
            user_id: userId.trim(),
            support_role: role,
            access_tier: tier,
            can_reassign: canReassign,
            /** `inbox_ids` is accepted by the create endpoint but not modeled on the shared input type. */
            ...({ inbox_ids: inboxIds } as Record<string, unknown>),
        });
        setUserId("");
        setRole("agent");
        setTier("unassigned_and_own");
        setCanReassign(false);
        setInboxIds([]);
        setOpen(false);
    };

    return (
        <DialogRoot open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm">{t("support.agents.add")}</Button>} />
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("support.agents.add")}</DialogTitle>
                    <DialogDescription>{t("support.agents.addSubtitle")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.agents.userId")}</Label>
                        <Input value={userId} onChange={(e) => setUserId(e.target.value)} dir="ltr" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.agents.role")}</Label>
                        <Select value={role} onValueChange={(v) => setRole(v as SupportRole)}>
                            <SelectTrigger>
                                <SelectValue>{(value) => t(`support.role.${String(value)}`)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {ROLE_VALUES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {t(`support.role.${r}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.agents.tier")}</Label>
                        <Select value={tier} onValueChange={(v) => setTier(v as AccessTier)}>
                            <SelectTrigger>
                                <SelectValue>{(value) => t(`support.tier.${String(value)}`)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {TIER_VALUES.map((tr) => (
                                    <SelectItem key={tr} value={tr}>
                                        {t(`support.tier.${tr}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <Label className="text-sm">{t("support.agents.reassign")}</Label>
                        <Switch checked={canReassign} onCheckedChange={setCanReassign} />
                    </div>
                    {(inboxes ?? []).length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm">{t("support.agents.inboxes")}</Label>
                            <div className="flex flex-wrap gap-2">
                                {(inboxes ?? []).map((inbox) => {
                                    const selected = inboxIds.includes(inbox.id);
                                    return (
                                        <Button
                                            key={inbox.id}
                                            type="button"
                                            size="sm"
                                            variant={selected ? "default" : "outline"}
                                            onClick={() => toggleInbox(inbox.id)}
                                        >
                                            {inbox.name}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        {t("support.cancel")}
                    </Button>
                    <Button onClick={submit} disabled={create.isPending || userId.trim().length === 0} className="gap-2">
                        {create.isPending ? <Spinner className="size-4" /> : null}
                        {t("support.agents.create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
