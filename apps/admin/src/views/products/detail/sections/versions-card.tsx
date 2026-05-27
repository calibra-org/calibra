"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { MoneyInput } from "#/components/ui/money-input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { toast } from "#/components/ui/toast";
import { CircleDashed, Filter, MoreHorizontal, Plus, Sparkles, Trash2 } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useBatchVariations, useDeleteVariation, useUpdateVariation } from "#/lib/products/mutations";
import { useGlobalAttributes, useProductVariations, type VariationView } from "#/lib/products/queries";
import { applyPattern, defaultAbbrev, type SkuTokenSpec } from "#/lib/products/sku-generator";
import { type AttributeAxis, diffCartesian } from "#/lib/products/variations-cartesian";
import { statusTone, type VersionStatus } from "#/lib/products/versions-format";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

import { VersionTermNames } from "./versions-card.term-lookup";

interface VersionsBodyProps {
    productId: number | null;
    productType: ProductDetailFormValues["type"];
}

const STATUS_VALUES: VersionStatus[] = ["draft", "active", "inactive", "archived"];

/**
 * `apps/admin/src/views/products/detail/sections/versions-card.tsx`
 *
 * Sellable versions data-grid. Replaces the prior accordion-style {@link VariationsBody} with
 * a spreadsheet-ish layout: status pill per row, inline-edit SKU + price, status faceted
 * filter, missing-field quick filters, search across name + SKU, bulk-bar actions (status,
 * price, SKU generation, delete with order-aware fallback), and the regenerate dialog the
 * Customer choices card kicks into.
 *
 * Inventory rollup (the spec's "Stock" column) is intentionally read-only here — variations
 * carry stock via the `inventory_items` table which isn't piped through {@link VariationView}
 * yet; the column shows `—` until that wire-up lands.
 */
export function VersionsBody({ productId, productType }: VersionsBodyProps) {
    const t = useTranslations("Products.detail.versions");
    const tChoices = useTranslations("Products.detail.choices");
    const locale = useLocale() as Locale;
    const { watch } = useFormContext<ProductDetailFormValues>();
    const attributes = useGlobalAttributes();
    const variations = useProductVariations(productId);
    const attributeLinks = watch("attributeLinks");
    const productSku = watch("sku") ?? "";

    const variationAxes = useMemo<AttributeAxis[]>(
        () =>
            attributeLinks
                .filter((link) => link.usedForVariation && link.termIds.length > 0)
                .map((link) => ({ attribute_id: link.attributeId, term_ids: link.termIds })),
        [attributeLinks],
    );

    const batch = useBatchVariations(productId ?? 0);
    const updateVariation = useUpdateVariation(productId ?? 0);
    const deleteVariation = useDeleteVariation(productId ?? 0);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<Set<VersionStatus>>(() => new Set());
    const [quickFilters, setQuickFilters] = useState<{ missingPrice: boolean; missingSku: boolean; missingImage: boolean }>({
        missingPrice: false,
        missingSku: false,
        missingImage: false,
    });
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [setPriceOpen, setSetPriceOpen] = useState(false);
    const [skuGenOpen, setSkuGenOpen] = useState(false);
    const [archiveOutdated, setArchiveOutdated] = useState(true);

    if (productType !== "variable") {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
                <CircleDashed className="size-3.5" aria-hidden="true" />
                {t("notVariableHint")}
            </div>
        );
    }

    if (variationAxes.length === 0) {
        return (
            <OnboardingHint
                variant="inline"
                id="versions.no-choices"
                icon={Sparkles}
                title={t("needChoicesTitle")}
                description={t("needChoicesDescription")}
            />
        );
    }

    const rows = variations.data ?? [];
    const filtered = rows.filter((row) => {
        if (statusFilter.size > 0 && !statusFilter.has(row.status)) return false;
        if (quickFilters.missingPrice && row.regularPriceMinor !== null) return false;
        if (quickFilters.missingSku && row.sku !== null && row.sku.length > 0) return false;
        if (quickFilters.missingImage && row.imageMediaId !== null) return false;
        if (search.length > 0) {
            const haystack = `${row.sku ?? ""}`.toLowerCase();
            if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
    });

    const diff = diffCartesian(
        variationAxes,
        rows.map((v) => ({ id: v.id, pins: v.pins })),
    );

    const onGenerate = async () => {
        if (productId === null) return;
        try {
            await batch.mutateAsync({
                create: diff.create.map((pins) => ({
                    attribute_pins: pins.map((p) => ({ attribute_id: p.attribute_id, term_id: p.term_id })),
                    status: "draft",
                })),
                ...(archiveOutdated && diff.outdated.length > 0
                    ? { update: diff.outdated.map((v) => ({ id: v.id, status: "archived" })) }
                    : {}),
            });
            toast.add({ title: t("toasts.generated"), data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: t("toasts.generateFailed"), description: String(error), data: { tone: "error" } });
        } finally {
            setRegenerateOpen(false);
        }
    };

    const toggleSelected = (id: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const toggleSelectAll = () =>
        setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))));
    const clearSelection = () => setSelected(new Set());

    const bulkMarkStatus = async (status: VersionStatus) => {
        if (selected.size === 0 || productId === null) return;
        try {
            await batch.mutateAsync({
                update: Array.from(selected).map((id) => ({ id, status })),
            });
            toast.add({
                title: t("toasts.bulkUpdated", { count: formatNumber(selected.size, locale) }),
                data: { tone: "success" },
            });
            clearSelection();
        } catch (error) {
            toast.add({ title: t("toasts.bulkUpdateFailed"), description: String(error), data: { tone: "error" } });
        }
    };

    const checklistVisible = rows.length > 0;
    const missingPrices = rows.filter((r) => r.regularPriceMinor === null).length;
    const missingSkus = rows.filter((r) => r.sku === null || r.sku.length === 0).length;
    const missingImages = rows.filter((r) => r.status === "active" && r.imageMediaId === null).length;
    const draftCount = rows.filter((r) => r.status === "draft").length;
    const checklistComplete = missingPrices === 0 && missingSkus === 0 && missingImages === 0 && draftCount === 0;

    return (
        <div className="flex flex-col gap-3">
            {checklistVisible && !checklistComplete ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">
                    <p className="mb-2 font-medium text-foreground">{t("checklist.title")}</p>
                    <ul className="flex flex-col gap-1">
                        <ChecklistRow
                            done={missingPrices === 0}
                            label={t("checklist.prices")}
                            count={missingPrices}
                            onClick={() => setQuickFilters({ ...quickFilters, missingPrice: true })}
                        />
                        <ChecklistRow
                            done={missingSkus === 0}
                            label={t("checklist.skus")}
                            count={missingSkus}
                            onClick={() => setQuickFilters({ ...quickFilters, missingSku: true })}
                        />
                        <ChecklistRow
                            done={missingImages === 0}
                            label={t("checklist.images")}
                            count={missingImages}
                            onClick={() => setQuickFilters({ ...quickFilters, missingImage: true })}
                        />
                        <ChecklistRow
                            done={draftCount === 0}
                            label={t("checklist.drafts")}
                            count={draftCount}
                            onClick={() => setStatusFilter(new Set(["draft"]))}
                        />
                    </ul>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("search")}
                    className="h-9 w-64"
                    aria-label={t("search")}
                />
                <StatusFilterPopover selected={statusFilter} onChange={setStatusFilter} />
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button {...props} type="button" variant="outline" size="sm">
                                <Filter className="size-3.5" aria-hidden="true" />
                                {t("filter.status")}
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => setQuickFilters({ ...quickFilters, missingPrice: !quickFilters.missingPrice })}
                        >
                            {quickFilters.missingPrice ? "✓ " : ""}
                            {t("filter.missingPrice")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setQuickFilters({ ...quickFilters, missingSku: !quickFilters.missingSku })}
                        >
                            {quickFilters.missingSku ? "✓ " : ""}
                            {t("filter.missingSku")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setQuickFilters({ ...quickFilters, missingImage: !quickFilters.missingImage })}
                        >
                            {quickFilters.missingImage ? "✓ " : ""}
                            {t("filter.missingImage")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {statusFilter.size > 0 || quickFilters.missingPrice || quickFilters.missingSku || quickFilters.missingImage ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setStatusFilter(new Set());
                            setQuickFilters({ missingPrice: false, missingSku: false, missingImage: false });
                        }}
                    >
                        {t("filter.clearAll")}
                    </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="ms-auto" onClick={() => setRegenerateOpen(true)}>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {t("regenerate")}
                </Button>
            </div>

            {filtered.length === 0 ? (
                <p className="rounded-md border border-border border-dashed bg-muted/30 p-3 text-center text-muted-foreground text-xs">
                    {rows.length === 0 ? tChoices("totalCount", { count: 0 }) : t("noResults")}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={selected.size > 0 && selected.size === filtered.length}
                                        onCheckedChange={toggleSelectAll}
                                        aria-label={t("selection.selectAll")}
                                    />
                                </TableHead>
                                <TableHead>{t("columns.version")}</TableHead>
                                <TableHead className="w-40">{t("columns.sku")}</TableHead>
                                <TableHead className="w-44">{t("columns.price")}</TableHead>
                                <TableHead className="w-28">{t("columns.status")}</TableHead>
                                <TableHead className="w-10" aria-label={t("columns.actions")} />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((row) => (
                                <VersionRow
                                    key={row.id}
                                    row={row}
                                    selected={selected.has(row.id)}
                                    onToggleSelect={() => toggleSelected(row.id)}
                                    onUpdatePrice={async (next) => {
                                        try {
                                            await updateVariation.mutateAsync({
                                                variationId: row.id,
                                                body: { regular_price: next === null ? null : Math.round(next) },
                                            });
                                        } catch (error) {
                                            toast.add({
                                                title: t("toasts.saveFailed"),
                                                description: String(error),
                                                data: { tone: "error" },
                                            });
                                        }
                                    }}
                                    onUpdateSku={async (next) => {
                                        try {
                                            await updateVariation.mutateAsync({
                                                variationId: row.id,
                                                body: { sku: next.length === 0 ? null : next },
                                            });
                                        } catch (error) {
                                            toast.add({
                                                title: t("toasts.saveFailed"),
                                                description: String(error),
                                                data: { tone: "error" },
                                            });
                                        }
                                    }}
                                    onUpdateStatus={async (next) => {
                                        try {
                                            await updateVariation.mutateAsync({
                                                variationId: row.id,
                                                body: { status: next },
                                            });
                                        } catch (error) {
                                            toast.add({
                                                title: t("toasts.saveFailed"),
                                                description: String(error),
                                                data: { tone: "error" },
                                            });
                                        }
                                    }}
                                    onDelete={async () => {
                                        try {
                                            await deleteVariation.mutateAsync({ variationId: row.id });
                                            toast.add({ title: t("toasts.deleted"), data: { tone: "success" } });
                                        } catch {
                                            try {
                                                await updateVariation.mutateAsync({
                                                    variationId: row.id,
                                                    body: { status: "archived" },
                                                });
                                                toast.add({ title: t("toasts.deleteRefused"), data: { tone: "warning" } });
                                            } catch (error) {
                                                toast.add({
                                                    title: t("toasts.saveFailed"),
                                                    description: String(error),
                                                    data: { tone: "error" },
                                                });
                                            }
                                        }
                                    }}
                                    attributesIndex={attributes.data ?? []}
                                    locale={locale}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {selected.size > 0 ? (
                <div
                    aria-live="polite"
                    className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs shadow-sm"
                >
                    <span className="font-medium text-foreground">
                        {t("selection.selectedCount", { count: formatNumber(selected.size, locale) })}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSetPriceOpen(true)}>
                        {t("bulk.setPrice")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSkuGenOpen(true)}>
                        {t("bulk.generateSku")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void bulkMarkStatus("active")}>
                        {t("bulk.markActive")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void bulkMarkStatus("inactive")}>
                        {t("bulk.markInactive")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void bulkMarkStatus("archived")}>
                        {t("bulk.markArchived")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="ms-auto" onClick={clearSelection}>
                        {t("bulk.clear")}
                    </Button>
                </div>
            ) : null}

            <RegenerateDialog
                open={regenerateOpen}
                onClose={() => setRegenerateOpen(false)}
                onConfirm={() => void onGenerate()}
                createCount={diff.create.length}
                unchangedCount={diff.unchanged.length}
                outdatedCount={diff.outdated.length}
                archiveOutdated={archiveOutdated}
                onToggleArchiveOutdated={setArchiveOutdated}
                busy={batch.isPending}
            />

            <SetPriceDialog
                open={setPriceOpen}
                onClose={() => setSetPriceOpen(false)}
                selected={rows.filter((r) => selected.has(r.id))}
                onApply={async (compute) => {
                    if (selected.size === 0 || productId === null) return;
                    try {
                        const updates = rows
                            .filter((r) => selected.has(r.id))
                            .map((r) => ({ id: r.id, regular_price: compute(r) }));
                        await batch.mutateAsync({ update: updates });
                        toast.add({
                            title: t("toasts.bulkUpdated", { count: formatNumber(selected.size, locale) }),
                            data: { tone: "success" },
                        });
                        clearSelection();
                        setSetPriceOpen(false);
                    } catch (error) {
                        toast.add({ title: t("toasts.bulkUpdateFailed"), description: String(error), data: { tone: "error" } });
                    }
                }}
                locale={locale}
                busy={batch.isPending}
            />

            <SkuGeneratorDialog
                open={skuGenOpen}
                onClose={() => setSkuGenOpen(false)}
                selected={rows.filter((r) => selected.has(r.id))}
                productSku={productSku.length > 0 ? productSku : "SKU"}
                axes={variationAxes}
                attributes={attributes.data ?? []}
                onApply={async (skuByVariationId) => {
                    if (productId === null) return;
                    try {
                        await batch.mutateAsync({
                            update: Object.entries(skuByVariationId).map(([id, sku]) => ({
                                id: Number(id),
                                sku,
                            })),
                        });
                        toast.add({
                            title: t("toasts.skusApplied", {
                                count: formatNumber(Object.keys(skuByVariationId).length, locale),
                            }),
                            data: { tone: "success" },
                        });
                        clearSelection();
                        setSkuGenOpen(false);
                    } catch (error) {
                        toast.add({ title: t("toasts.bulkUpdateFailed"), description: String(error), data: { tone: "error" } });
                    }
                }}
                busy={batch.isPending}
            />
        </div>
    );
}

function ChecklistRow({ done, label, count, onClick }: { done: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <li className="flex items-center gap-2">
            <span
                className={cn(
                    "size-3.5 rounded-sm border",
                    done ? "border-success bg-success/20 text-success" : "border-border bg-background",
                )}
            >
                {done ? <span aria-hidden="true">✓</span> : null}
            </span>
            <button
                type="button"
                className={cn(
                    "text-start",
                    done ? "cursor-default text-muted-foreground line-through" : "text-foreground hover:underline",
                )}
                onClick={done ? undefined : onClick}
                disabled={done}
            >
                {label}
                {count > 0 ? <span className="text-muted-foreground"> ({count})</span> : null}
            </button>
        </li>
    );
}

interface VersionRowProps {
    row: VariationView;
    selected: boolean;
    onToggleSelect: () => void;
    onUpdatePrice: (next: number | null) => Promise<void>;
    onUpdateSku: (next: string) => Promise<void>;
    onUpdateStatus: (next: VersionStatus) => Promise<void>;
    onDelete: () => Promise<void>;
    attributesIndex: { id: number; name: string }[];
    locale: Locale;
}

function VersionRow({
    row,
    selected,
    onToggleSelect,
    onUpdatePrice,
    onUpdateSku,
    onUpdateStatus,
    onDelete,
    attributesIndex,
    locale: _locale,
}: VersionRowProps) {
    const t = useTranslations("Products.detail.versions");
    const [sku, setSku] = useState(row.sku ?? "");
    const tone = statusTone(row.status);
    return (
        <TableRow data-state={selected ? "selected" : undefined}>
            <TableCell className="w-10">
                <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={t("selection.selectRow")} />
            </TableCell>
            <TableCell>
                <VersionTermNames pins={row.pins} attributesIndex={attributesIndex} fallback={t("rowSummaryFallback")} />
            </TableCell>
            <TableCell className="w-40">
                <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    onBlur={() => sku !== (row.sku ?? "") && void onUpdateSku(sku)}
                    dir="ltr"
                    className="h-8 font-mono text-xs"
                    aria-label={t("columns.sku")}
                />
            </TableCell>
            <TableCell className="w-44">
                <MoneyInput
                    valueMinor={row.regularPriceMinor}
                    onChangeMinor={(next) => void onUpdatePrice(next)}
                    min={0}
                    step={1000}
                />
            </TableCell>
            <TableCell className="w-28">
                <Popover>
                    <PopoverTrigger
                        render={(props) => (
                            <button
                                {...props}
                                type="button"
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
                                    tone === "success" && "border-success/30 bg-success/10 text-success",
                                    tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
                                    tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
                                    tone === "neutral" && "border-border bg-muted text-muted-foreground",
                                )}
                            >
                                {t(`status.${row.status}`)}
                            </button>
                        )}
                    />
                    <PopoverContent className="w-40 p-1">
                        {STATUS_VALUES.map((s) => (
                            <button
                                key={s}
                                type="button"
                                className="block w-full rounded px-2 py-1 text-start text-xs hover:bg-muted"
                                onClick={() => void onUpdateStatus(s)}
                            >
                                {t(`status.${s}`)}
                            </button>
                        ))}
                    </PopoverContent>
                </Popover>
            </TableCell>
            <TableCell className="w-10">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button {...props} type="button" variant="ghost" size="icon" className="size-7">
                                <MoreHorizontal className="size-3.5" aria-hidden="true" />
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void onUpdateStatus("archived")}>
                            {t("rowActions.archive")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void onDelete()} className="text-danger">
                            <Trash2 className="me-2 size-3.5" aria-hidden="true" />
                            {t("rowActions.delete")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}

function StatusFilterPopover({
    selected,
    onChange,
}: {
    selected: Set<VersionStatus>;
    onChange: (next: Set<VersionStatus>) => void;
}) {
    const t = useTranslations("Products.detail.versions");
    return (
        <Popover>
            <PopoverTrigger
                render={(props) => (
                    <Button {...props} type="button" variant="outline" size="sm">
                        <Plus className="size-3.5" aria-hidden="true" />
                        {t("filter.status")}
                        {selected.size > 0 ? (
                            <Badge variant="secondary" className="ms-1">
                                {selected.size}
                            </Badge>
                        ) : null}
                    </Button>
                )}
            />
            <PopoverContent className="w-44 p-1">
                {STATUS_VALUES.map((s) => {
                    const checked = selected.has(s);
                    return (
                        <div
                            key={s}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                        >
                            <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                    const next = new Set(selected);
                                    if (checked) next.delete(s);
                                    else next.add(s);
                                    onChange(next);
                                }}
                            />
                            <span>{t(`status.${s}`)}</span>
                        </div>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}

function RegenerateDialog({
    open,
    onClose,
    onConfirm,
    createCount,
    unchangedCount,
    outdatedCount,
    archiveOutdated,
    onToggleArchiveOutdated,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    createCount: number;
    unchangedCount: number;
    outdatedCount: number;
    archiveOutdated: boolean;
    onToggleArchiveOutdated: (next: boolean) => void;
    busy: boolean;
}) {
    const t = useTranslations("Products.detail.versions.regenerateDialog");
    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>
                        <ul className="flex flex-col gap-1">
                            <li>{t("summaryNew", { count: createCount })}</li>
                            <li>{t("summaryUnchanged", { count: unchangedCount })}</li>
                            {outdatedCount > 0 ? <li>{t("summaryOutdated", { count: outdatedCount })}</li> : null}
                        </ul>
                    </DialogDescription>
                </DialogHeader>
                {outdatedCount > 0 ? (
                    <div className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox checked={archiveOutdated} onCheckedChange={(v) => onToggleArchiveOutdated(v === true)} />
                        {t("archiveOutdated")}
                    </div>
                ) : null}
                <p className="text-muted-foreground text-xs">{t("draftNote")}</p>
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" onClick={onConfirm} disabled={busy || createCount === 0}>
                        {t("confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SetPriceDialog({
    open,
    onClose,
    selected,
    onApply,
    locale,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    selected: VariationView[];
    onApply: (compute: (row: VariationView) => number | null) => Promise<void>;
    locale: Locale;
    busy: boolean;
}) {
    const t = useTranslations("Products.detail.versions.setPriceDialog");
    const [mode, setMode] = useState<"absolute" | "percent">("absolute");
    const [absoluteMinor, setAbsoluteMinor] = useState<number | null>(null);
    const [percent, setPercent] = useState<number>(0);

    const compute = (row: VariationView): number | null => {
        if (mode === "absolute") return absoluteMinor;
        if (row.regularPriceMinor === null) return null;
        return Math.round(row.regularPriceMinor * (1 + percent / 100));
    };
    const previews = selected.slice(0, 3).map((row) => compute(row));

    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">{t("mode")}</span>
                        <Select value={mode} onValueChange={(v) => setMode(v as "absolute" | "percent")}>
                            <SelectTrigger className="h-8 w-48" aria-label={t("mode")}>
                                <SelectValue>
                                    {(value) => (value === "percent" ? t("modePercent") : t("modeAbsolute"))}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="absolute">{t("modeAbsolute")}</SelectItem>
                                <SelectItem value="percent">{t("modePercent")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {mode === "absolute" ? (
                        <div className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">{t("absoluteLabel")}</span>
                            <MoneyInput valueMinor={absoluteMinor} onChangeMinor={setAbsoluteMinor} min={0} step={1000} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">{t("percentLabel")}</span>
                            <Input
                                type="number"
                                step="1"
                                value={percent}
                                onChange={(e) => setPercent(Number(e.target.value))}
                                className="h-8 w-32"
                                dir="ltr"
                                aria-label={t("percentLabel")}
                            />
                            <span className="text-muted-foreground text-xs">{t("percentHint")}</span>
                        </div>
                    )}
                    <div className="rounded border border-border bg-muted/30 p-2 text-xs">
                        <p className="mb-1 text-muted-foreground">{t("preview")}</p>
                        <ul className="flex flex-col gap-1">
                            {previews.map((p, i) => (
                                <li key={`${selected[i]?.id ?? i}`} className="font-mono">
                                    {p === null ? "—" : formatNumber(p, locale)}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || (mode === "absolute" && absoluteMinor === null)}
                        onClick={() => void onApply(compute)}
                    >
                        {t("apply", { count: selected.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SkuGeneratorDialog({
    open,
    onClose,
    selected,
    productSku,
    axes,
    attributes,
    onApply,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    selected: VariationView[];
    productSku: string;
    axes: AttributeAxis[];
    attributes: { id: number; name: string }[];
    onApply: (skuByVariationId: Record<number, string>) => Promise<void>;
    busy: boolean;
}) {
    const t = useTranslations("Products.detail.versions.skuGenerator");
    const tokens: SkuTokenSpec[] = useMemo(
        () =>
            axes.map((axis) => {
                const attribute = attributes.find((a) => a.id === axis.attribute_id);
                const tokenName = (attribute?.name ?? `attr${axis.attribute_id}`).replace(/\s+/g, "-").toLowerCase();
                return { token: tokenName, attributeId: axis.attribute_id, abbreviations: {} };
            }),
        [axes, attributes],
    );
    const [pattern, setPattern] = useState<string>(() => `{product}-${tokens.map((t) => `{${t.token}}`).join("-")}`);
    const [abbrevByTermId, setAbbrevByTermId] = useState<Record<number, string>>({});

    const liveTokens = tokens.map((tk) => ({
        ...tk,
        abbreviations: { ...tk.abbreviations, ...abbrevByTermId },
    }));
    /**
     * Term names are pulled from the variation `pins` directly — every selected variation will
     * carry the same axis term ids in its pin set, so we have a deterministic id → name view.
     */
    const termNameById: Record<number, string> = {};
    for (const row of selected) {
        for (const pin of row.pins) {
            if (pin.term_id === null) continue;
            if (termNameById[pin.term_id] === undefined) termNameById[pin.term_id] = "";
        }
    }

    const result = applyPattern(pattern, productSku, selected, liveTokens, termNameById);

    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("subtitle")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">{t("patternLabel")}</span>
                        <Input
                            value={pattern}
                            onChange={(e) => setPattern(e.target.value)}
                            dir="ltr"
                            className="h-8 font-mono"
                            aria-label={t("patternLabel")}
                        />
                        <span className="text-muted-foreground">{t("patternHint")}</span>
                    </div>

                    <div className="rounded border border-border bg-muted/30 p-2 text-xs">
                        <p className="mb-1 text-muted-foreground">{t("abbrevLabel")}</p>
                        <ul className="flex flex-col gap-1">
                            {Object.keys(termNameById).map((id) => {
                                const termId = Number(id);
                                return (
                                    <li key={id} className="flex items-center gap-2">
                                        <span className="w-24 truncate text-foreground">#{termId}</span>
                                        <Input
                                            value={abbrevByTermId[termId] ?? defaultAbbrev(String(termId))}
                                            onChange={(e) => setAbbrevByTermId({ ...abbrevByTermId, [termId]: e.target.value })}
                                            className="h-7 w-24 font-mono text-xs"
                                            dir="ltr"
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="rounded border border-border bg-muted/30 p-2 text-xs">
                        <p className="mb-1 text-muted-foreground">{t("previewLabel")}</p>
                        <ul className="flex flex-col gap-1 font-mono">
                            {selected.slice(0, 3).map((row) => (
                                <li key={row.id}>{result.skuByVariationId[row.id] ?? "—"}</li>
                            ))}
                        </ul>
                    </div>

                    {result.collisions.length > 0 ? (
                        <p className="rounded border border-danger/30 bg-danger/5 p-2 text-danger text-xs">
                            {t("collisionWarning", { count: result.collisions.length })}
                        </p>
                    ) : null}
                </div>
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || result.collisions.length > 0 || selected.length === 0}
                        onClick={() => void onApply(result.skuByVariationId)}
                    >
                        {t("apply", { count: selected.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
