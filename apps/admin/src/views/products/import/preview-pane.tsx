"use client";

import { AlertTriangle, CheckCircle2, MinusCircle, Plus, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { toPersianDigits } from "@calibra/shared/digits";

import { Badge } from "#/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type { PreviewResult } from "#/lib/imports/types";
import { cn } from "#/lib/utils";

export interface PreviewPaneProps {
    preview: PreviewResult;
}

type TabKey = "create" | "update" | "skip" | "fail" | "warnings";

/**
 * Step 2.5 — dry-run results shown inline below the mapping table. Renders the counter card up
 * top, then a 5-tab panel with the inline diff list, anomaly warnings, and the first-10 failure
 * rows. Display digits are Persianised when the locale is `fa`, matching the rest of the admin.
 */
export function PreviewPane({ preview }: PreviewPaneProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.preview");
    const locale = useLocale();
    const fmt = useMemo(() => (locale === "fa" ? (n: number) => toPersianDigits(n) : (n: number) => String(n)), [locale]);

    const [tab, setTab] = useState<TabKey>(() => initialTab(preview));

    return (
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-lg">{t("title")}</h3>
                    <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
            </header>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <CounterCard tone="success" label={t("create")} value={fmt(preview.totals.create)} icon={<Plus className="size-4" aria-hidden />} />
                <CounterCard tone="info" label={t("update")} value={fmt(preview.totals.update)} icon={<RefreshCw className="size-4" aria-hidden />} />
                <CounterCard tone="muted" label={t("skip")} value={fmt(preview.totals.skip)} icon={<MinusCircle className="size-4" aria-hidden />} />
                <CounterCard tone="danger" label={t("fail")} value={fmt(preview.totals.fail)} icon={<AlertTriangle className="size-4" aria-hidden />} />
                <CounterCard
                    tone="warning"
                    label={t("warnings")}
                    value={fmt(preview.totals.warnings)}
                    icon={<AlertTriangle className="size-4" aria-hidden />}
                />
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} className="mt-6">
                <TabsList>
                    <TabsTrigger value="create">
                        {t("create")} ({fmt(preview.totals.create)})
                    </TabsTrigger>
                    <TabsTrigger value="update">
                        {t("update")} ({fmt(preview.totals.update)})
                    </TabsTrigger>
                    <TabsTrigger value="skip">
                        {t("skip")} ({fmt(preview.totals.skip)})
                    </TabsTrigger>
                    <TabsTrigger value="fail">
                        {t("fail")} ({fmt(preview.totals.fail)})
                    </TabsTrigger>
                    <TabsTrigger value="warnings">
                        {t("warnings")} ({fmt(preview.totals.warnings)})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="create">
                    <EmptyOrMessage shown={preview.totals.create === 0} message={t("noCreate")}>
                        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                            {t("createSummary", { count: fmt(preview.totals.create) })}
                        </p>
                    </EmptyOrMessage>
                </TabsContent>

                <TabsContent value="update">
                    <EmptyOrMessage shown={preview.updatesPreview.length === 0} message={t("noUpdates")}>
                        <ul className="space-y-3">
                            {preview.updatesPreview.map((row) => (
                                <li key={`${row.sku}-${row.rowNumber}`} className="rounded-md border p-3">
                                    <header className="flex items-baseline justify-between gap-2">
                                        <span className="font-mono text-sm">{row.sku}</span>
                                        <span className="text-muted-foreground text-xs">{t("rowLabel", { n: fmt(row.rowNumber) })}</span>
                                    </header>
                                    <ul className="mt-2 space-y-1 text-sm">
                                        {row.diffs.map((diff) => (
                                            <li key={diff.field} className="flex items-center gap-2">
                                                <span className="font-medium">{diff.field}:</span>
                                                <span className="text-muted-foreground">{diff.oldValue ?? "—"}</span>
                                                <span aria-hidden>→</span>
                                                <span>{diff.newValue ?? "—"}</span>
                                                {diff.percentChange !== null ? (
                                                    <Badge variant={diff.percentChange > 0 ? "default" : "secondary"} className="font-normal text-[10px]">
                                                        {diff.percentChange > 0 ? "+" : ""}
                                                        {fmt(Math.round(diff.percentChange * 10) / 10)}%
                                                    </Badge>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </EmptyOrMessage>
                </TabsContent>

                <TabsContent value="skip">
                    <EmptyOrMessage shown={preview.totals.skip === 0} message={t("noSkip")}>
                        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                            {t("skipSummary", { count: fmt(preview.totals.skip) })}
                        </p>
                    </EmptyOrMessage>
                </TabsContent>

                <TabsContent value="fail">
                    <EmptyOrMessage shown={preview.failures.length === 0} message={t("noFail")}>
                        <ul className="space-y-2">
                            {preview.failures.map((failure, idx) => (
                                <li
                                    key={`${failure.rowNumber}-${failure.columnName ?? "row"}-${idx}`}
                                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-mono">{failure.sku ?? "—"}</span>
                                        <span className="text-muted-foreground text-xs">{t("rowLabel", { n: fmt(failure.rowNumber) })}</span>
                                    </div>
                                    <p className="mt-1 text-destructive">
                                        {failure.columnName !== null ? <span className="font-semibold">{failure.columnName}: </span> : null}
                                        {failure.message}
                                        {failure.originalValue !== null ? (
                                            <span className="ms-1 text-muted-foreground">«{failure.originalValue}»</span>
                                        ) : null}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </EmptyOrMessage>
                </TabsContent>

                <TabsContent value="warnings">
                    <EmptyOrMessage shown={preview.warnings.length === 0} message={t("noWarnings")}>
                        <ul className="space-y-2">
                            {preview.warnings.map((finding, idx) => (
                                <li
                                    key={`${finding.code}-${idx}`}
                                    className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
                                            {t(`anomaly.${finding.code}`)}
                                        </Badge>
                                        <span className="text-muted-foreground text-xs">
                                            {t("rowsLabel", { n: fmt(finding.rowNumbers.length) })}
                                        </span>
                                    </div>
                                    <p className="mt-1">{finding.message}</p>
                                </li>
                            ))}
                        </ul>
                    </EmptyOrMessage>
                </TabsContent>
            </Tabs>
        </article>
    );
}

function initialTab(preview: PreviewResult): TabKey {
    if (preview.totals.warnings > 0) return "warnings";
    if (preview.failures.length > 0) return "fail";
    if (preview.updatesPreview.length > 0) return "update";
    return "create";
}

interface CounterCardProps {
    tone: "success" | "info" | "muted" | "warning" | "danger";
    label: string;
    value: string;
    icon: React.ReactNode;
}

function CounterCard({ tone, label, value, icon }: CounterCardProps): React.JSX.Element {
    return (
        <div
            className={cn(
                "flex flex-col gap-1 rounded-md border bg-muted/30 p-3",
                tone === "success" && "border-emerald-500/30 bg-emerald-500/5",
                tone === "info" && "border-sky-500/30 bg-sky-500/5",
                tone === "warning" && "border-amber-500/30 bg-amber-500/5",
                tone === "danger" && "border-destructive/30 bg-destructive/5",
            )}
        >
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {icon}
                <span>{label}</span>
            </div>
            <div className="font-semibold text-2xl">{value}</div>
        </div>
    );
}

function EmptyOrMessage({
    shown,
    message,
    children,
}: {
    shown: boolean;
    message: string;
    children: React.ReactNode;
}): React.JSX.Element {
    if (shown) {
        return (
            <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">{message}</div>
        );
    }
    return <div className="mt-3">{children}</div>;
}
