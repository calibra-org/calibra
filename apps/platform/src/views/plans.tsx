"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { ConsoleSelect } from "#/components/ConsoleSelect";
import { PageHeader } from "#/components/PageHeader";
import { StatusPill } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Plus } from "#/icons";
import { formatNumber } from "#/lib/format";
import { usePlans, useSavePlan } from "#/lib/queries";

export function PlansView() {
    const t = useTranslations("Plans");
    const locale = useLocale();
    const plans = usePlans();
    const save = useSavePlan();
    const [creating, setCreating] = useState(false);
    const [key, setKey] = useState("");
    const [name, setName] = useState("");
    const [dbTier, setDbTier] = useState("shared");

    async function onCreate(e: FormEvent) {
        e.preventDefault();
        await save.mutateAsync({ input: { key, name, db_tier: dbTier } });
        setKey("");
        setName("");
        setDbTier("shared");
        setCreating(false);
    }

    return (
        <div>
            <PageHeader
                title={t("title")}
                actions={
                    <Button onClick={() => setCreating((c) => !c)}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("newPlan")}
                    </Button>
                }
            />

            {creating ? (
                <form onSubmit={onCreate} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
                    <div className="flex flex-col gap-1.5">
                        <Label>{t("key")}</Label>
                        <Input
                            dir="ltr"
                            value={key}
                            onChange={(e) => setKey(e.target.value.toLowerCase())}
                            placeholder="growth"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label>{t("name")}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label>{t("dbTier")}</Label>
                        <ConsoleSelect
                            ariaLabel={t("dbTier")}
                            value={dbTier}
                            onValueChange={setDbTier}
                            options={[
                                { value: "shared", label: t("shared") },
                                { value: "dedicated", label: t("dedicated") },
                            ]}
                        />
                    </div>
                    <Button type="submit" disabled={save.isPending}>
                        {t("newPlan")}
                    </Button>
                </form>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border">
                <Table className="console-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("key")}</TableHead>
                            <TableHead>{t("name")}</TableHead>
                            <TableHead>{t("dbTier")}</TableHead>
                            <TableHead>{t("limits")}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {plans.isPending ? (
                            <TableRow>
                                <TableCell colSpan={5}>
                                    <Skeleton className="h-5 w-full" />
                                </TableCell>
                            </TableRow>
                        ) : plans.data && plans.data.length > 0 ? (
                            plans.data.map((p) => <PlanRow key={p.id} plan={p} locale={locale} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                                    {t("empty")}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function PlanRow({ plan, locale }: { plan: import("#/lib/types").Plan; locale: string }) {
    const t = useTranslations("Plans");
    const save = useSavePlan();
    const limitCount = Object.keys(plan.limits ?? {}).length;

    return (
        <TableRow>
            <TableCell dir="ltr" className="font-medium">
                {plan.key}
            </TableCell>
            <TableCell>
                {plan.name}
                {plan.is_default ? (
                    <StatusPill tone="info">
                        <span className="ms-1">{t("default")}</span>
                    </StatusPill>
                ) : null}
            </TableCell>
            <TableCell>
                <ConsoleSelect
                    ariaLabel={t("dbTier")}
                    className="w-36"
                    value={plan.db_tier}
                    onValueChange={(v) => save.mutate({ id: plan.id, input: { db_tier: v } })}
                    options={[
                        { value: "shared", label: t("shared") },
                        { value: "dedicated", label: t("dedicated") },
                    ]}
                />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{formatNumber(limitCount, locale)}</TableCell>
            <TableCell className="text-end">
                {!plan.is_default ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={save.isPending}
                        onClick={() => save.mutate({ id: plan.id, input: { is_default: true } })}
                    >
                        {t("default")}
                    </Button>
                ) : null}
            </TableCell>
        </TableRow>
    );
}
