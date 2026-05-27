"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DataTable } from "#/components/ui/data-grid";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { MoneyInput } from "#/components/ui/money-input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { CircleDashed, Filter, Plus, Sparkles, Trash2 } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useBatchVariations, useDeleteVariation, useUpdateProduct, useUpdateVariation } from "#/lib/products/mutations";
import { useGlobalAttributes, useProductVariations, type VariationView } from "#/lib/products/queries";
import { applyPattern, defaultAbbrev, type SkuTokenSpec } from "#/lib/products/sku-generator";
import { type AttributeAxis, diffCartesian } from "#/lib/products/variations-cartesian";
import type { VersionStatus } from "#/lib/products/versions-format";
import { cn } from "#/lib/utils";

import { formValuesToPayload, type ProductDetailFormValues } from "../schema";

import { buildVersionColumns } from "./versions-card.columns";

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
    const { control, watch, getValues, formState, reset } = useFormContext<ProductDetailFormValues>();
    const attributes = useGlobalAttributes();
    const variations = useProductVariations(productId);
    const updateProduct = useUpdateProduct(productId ?? 0);
    /**
     * `useWatch` (vs the parent's `watch()`) subscribes through RHF's controller channel, so
     * nested term-id changes inside `attributeLinks[i].termIds` bubble back here. The plain
     * `watch("attributeLinks")` returned the same top-level array reference even after a nested
     * mutation, so the cartesian memo never recomputed and the empty-state hint stayed glued
     * to the screen even after the operator picked values in the Choices card above.
     */
    const attributeLinks = useWatch({ control, name: "attributeLinks" });
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
    /**
     * Local-state mirror of the DataTable toolbar shape (`facetValues` for multi-select facets,
     * `toggleValues` for single booleans). This card's filters never round-trip to the URL — it's
     * an inline editor, not a routed list — but reusing the toolbar primitive keeps the visual
     * language consistent with every other admin table.
     */
    const [facetValues, setFacetValues] = useState<Record<string, string[]>>({ status: [] });
    const [toggleValues, setToggleValues] = useState<Record<string, boolean>>({
        missingPrice: false,
        missingSku: false,
        missingImage: false,
    });
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [setPriceOpen, setSetPriceOpen] = useState(false);
    const [skuGenOpen, setSkuGenOpen] = useState(false);
    const [archiveOutdated, setArchiveOutdated] = useState(true);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const statusFilter = facetValues.status ?? [];
    const quickFilters = {
        missingPrice: toggleValues.missingPrice === true,
        missingSku: toggleValues.missingSku === true,
        missingImage: toggleValues.missingImage === true,
    };
    const hasActiveFilters =
        statusFilter.length > 0 || quickFilters.missingPrice || quickFilters.missingSku || quickFilters.missingImage;
    const clearAllFilters = () => {
        setFacetValues({ status: [] });
        setToggleValues({ missingPrice: false, missingSku: false, missingImage: false });
        setSearch("");
    };

    /** DataTable speaks string ids; map back to the numeric variation ids the batch endpoint expects. */
    const selectedIdsNumeric = useMemo(
        () =>
            Array.from(selected)
                .map((id) => Number(id))
                .filter((n) => Number.isFinite(n)),
        [selected],
    );
    const selectedSetNumeric = useMemo(() => new Set(selectedIdsNumeric), [selectedIdsNumeric]);
    const clearSelection = () => setSelected(new Set());

    /**
     * Built once per relevant dep change; declared above the early-return gates so React's hook
     * order stays stable whether the gates fire or not. Putting it later violated rules-of-hooks
     * — the gates short-circuited before `useMemo` ran, so the hook count varied per render.
     */
    const columns = useMemo(
        () =>
            buildVersionColumns({
                locale,
                attributesIndex: attributes.data ?? [],
                onUpdatePrice: async (variationId, next) => {
                    try {
                        await updateVariation.mutateAsync({
                            variationId,
                            body: { regular_price: next === null ? null : Math.round(next) },
                        });
                    } catch (error) {
                        toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                    }
                },
                onUpdateSku: async (variationId, next) => {
                    try {
                        await updateVariation.mutateAsync({
                            variationId,
                            body: { sku: next.length === 0 ? null : next },
                        });
                    } catch (error) {
                        toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                    }
                },
                onUpdateStatus: async (variationId, next) => {
                    try {
                        await updateVariation.mutateAsync({ variationId, body: { status: next } });
                    } catch (error) {
                        toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                    }
                },
                onDelete: async (variationId) => {
                    try {
                        await deleteVariation.mutateAsync({ variationId });
                        toast.add({ title: t("toasts.deleted"), data: { tone: "success" } });
                    } catch {
                        try {
                            await updateVariation.mutateAsync({ variationId, body: { status: "archived" } });
                            toast.add({ title: t("toasts.deleteRefused"), data: { tone: "warning" } });
                        } catch (error) {
                            toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                        }
                    }
                },
                t,
            }),
        [attributes.data, deleteVariation, locale, t, updateVariation],
    );

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
                dismissible={false}
            />
        );
    }

    const rows = variations.data ?? [];
    const filtered = rows.filter((row) => {
        if (statusFilter.length > 0 && !statusFilter.includes(row.status)) return false;
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
        /**
         * Persist the product first so the backend's variable-type check + `used_for_variation`
         * link map are in sync with what the operator's seeing. Otherwise a fresh selling-mode
         * flip + choice picks would hit the batch endpoint while the DB still shows the old
         * `simple` type → 422 `parent_product_not_variable`. Reset the form's dirty flag from
         * the same values we just sent so the auto-save doesn't bounce on every Generate click.
         */
        if (formState.isDirty) {
            try {
                const payload = formValuesToPayload(getValues());
                await updateProduct.mutateAsync({ body: payload });
                reset(getValues());
            } catch (error) {
                toast.add({ title: t("toasts.generateFailed"), description: String(error), data: { tone: "error" } });
                setRegenerateOpen(false);
                return;
            }
        }
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

    const bulkMarkStatus = async (status: VersionStatus) => {
        if (selectedIdsNumeric.length === 0 || productId === null) return;
        try {
            await batch.mutateAsync({
                update: selectedIdsNumeric.map((id) => ({ id, status })),
            });
            toast.add({
                title: t("toasts.bulkUpdated", { count: formatNumber(selectedIdsNumeric.length, locale) }),
                data: { tone: "success" },
            });
            clearSelection();
        } catch (error) {
            toast.add({ title: t("toasts.bulkUpdateFailed"), description: String(error), data: { tone: "error" } });
        }
    };

    const bulkDelete = async () => {
        if (selectedIdsNumeric.length === 0 || productId === null) return;
        try {
            await batch.mutateAsync({ delete: selectedIdsNumeric });
            toast.add({
                title: t("toasts.bulkDeleted", { count: formatNumber(selectedIdsNumeric.length, locale) }),
                data: { tone: "success" },
            });
            clearSelection();
            setBulkDeleteOpen(false);
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
                            onClick={() => setToggleValues({ ...toggleValues, missingPrice: true })}
                        />
                        <ChecklistRow
                            done={missingSkus === 0}
                            label={t("checklist.skus")}
                            count={missingSkus}
                            onClick={() => setToggleValues({ ...toggleValues, missingSku: true })}
                        />
                        <ChecklistRow
                            done={missingImages === 0}
                            label={t("checklist.images")}
                            count={missingImages}
                            onClick={() => setToggleValues({ ...toggleValues, missingImage: true })}
                        />
                        <ChecklistRow
                            done={draftCount === 0}
                            label={t("checklist.drafts")}
                            count={draftCount}
                            onClick={() => setFacetValues({ ...facetValues, status: ["draft"] })}
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
                <StatusFilterPopover
                    selected={new Set(statusFilter as VersionStatus[])}
                    onChange={(next) => setFacetValues({ ...facetValues, status: Array.from(next) })}
                />
                <MissingFiltersPopover
                    values={quickFilters}
                    onChange={(next) => setToggleValues({ ...toggleValues, ...next })}
                />
                {hasActiveFilters ? (
                    <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                        {t("filter.clearAll")}
                    </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="ms-auto" onClick={() => setRegenerateOpen(true)}>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {t("regenerate")}
                </Button>
            </div>

            {/**
             * Inline use of the shared `DataTable` primitive — pagination is suppressed by feeding
             * single-page meta + a single-entry `perPageOptions`, since the variations table is
             * already constrained to a single product's rows and the editor's vertical real estate
             * would be wasted on a "1-N of N" footer. Toolbar + bulk-bar stay as custom inline
             * elements above / below so the editor's tighter visual language survives.
             */}
            <DataTable<VariationView>
                data={filtered}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={{ page: 1, perPage: Math.max(filtered.length, 1), total: filtered.length, lastPage: 1 }}
                perPageOptions={[Math.max(filtered.length, 1)]}
                onPageChange={() => undefined}
                onPerPageChange={() => undefined}
                selectedIds={selected}
                onSelectedIdsChange={(next) => setSelected(new Set(next))}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                density="cozy"
                hidePagination
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearAllFilters}
                stickyColumns={{ start: ["select", "version"], end: ["actions"] }}
                labels={{
                    empty: { title: tChoices("totalCount", { count: 0 }), description: t("needChoicesDescription") },
                    filtered: { title: t("noResults"), description: t("filter.clearAll") },
                    clearFiltersLabel: t("filter.clearAll"),
                    errorTitle: t("toasts.generateFailed"),
                    errorRetry: t("filter.clearAll"),
                    pagination: {
                        rowsPerPage: "",
                        showing: (_from, _to, total) => formatNumber(total, locale),
                        selectedOf: (selectedCount, total) =>
                            `${t("selection.selectedCount", { count: formatNumber(selectedCount, locale) })} / ${formatNumber(total, locale)}`,
                        first: "",
                        previous: "",
                        next: "",
                        last: "",
                        pageOf: () => "",
                    },
                }}
                formatNumber={(value) => formatNumber(value, locale)}
            />

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
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setBulkDeleteOpen(true)}
                    >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {t("bulk.delete")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="ms-auto" onClick={clearSelection}>
                        {t("bulk.clear")}
                    </Button>
                </div>
            ) : null}

            <Dialog open={bulkDeleteOpen} onOpenChange={(next) => (!next ? setBulkDeleteOpen(false) : undefined)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("bulkDeleteDialog.title")}</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">
                        {t("bulkDeleteDialog.body", { count: formatNumber(selected.size, locale) })}
                    </p>
                    <p className="text-muted-foreground text-xs">{t("bulkDeleteDialog.ordersPreserved")}</p>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setBulkDeleteOpen(false)}>
                            {t("bulkDeleteDialog.cancel")}
                        </Button>
                        <Button type="button" variant="destructive" disabled={batch.isPending} onClick={() => void bulkDelete()}>
                            {t("bulkDeleteDialog.confirm", { count: formatNumber(selected.size, locale) })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                selected={rows.filter((r) => selectedSetNumeric.has(r.id))}
                onApply={async (compute) => {
                    if (selected.size === 0 || productId === null) return;
                    try {
                        const updates = rows
                            .filter((r) => selectedSetNumeric.has(r.id))
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
                selected={rows.filter((r) => selectedSetNumeric.has(r.id))}
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

interface MissingFiltersValue {
    missingPrice: boolean;
    missingSku: boolean;
    missingImage: boolean;
}

/**
 * Mirrors `StatusFilterPopover`'s shape (Popover + Checkbox rows) so the editor's two facet
 * filters share one visual language — instead of the prior dropdown-with-"✓"-prefix which looked
 * misaligned next to the status chip popover.
 */
function MissingFiltersPopover({
    values,
    onChange,
}: {
    values: MissingFiltersValue;
    onChange: (next: Partial<MissingFiltersValue>) => void;
}) {
    const t = useTranslations("Products.detail.versions");
    const items: { key: keyof MissingFiltersValue; label: string }[] = [
        { key: "missingPrice", label: t("filter.missingPrice") },
        { key: "missingSku", label: t("filter.missingSku") },
        { key: "missingImage", label: t("filter.missingImage") },
    ];
    const activeCount = items.filter((item) => values[item.key]).length;
    return (
        <Popover>
            <PopoverTrigger
                render={(props) => (
                    <Button {...props} type="button" variant="outline" size="sm">
                        <Filter className="size-3.5" aria-hidden="true" />
                        {t("filter.status")}
                        {activeCount > 0 ? (
                            <Badge variant="secondary" className="ms-1">
                                {activeCount}
                            </Badge>
                        ) : null}
                    </Button>
                )}
            />
            <PopoverContent className="w-48 p-1">
                {items.map((item) => {
                    const checked = values[item.key];
                    return (
                        <div
                            key={item.key}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                        >
                            <Checkbox checked={checked} onCheckedChange={() => onChange({ [item.key]: !checked })} />
                            <span>{item.label}</span>
                        </div>
                    );
                })}
            </PopoverContent>
        </Popover>
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
                        <div key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
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
                </DialogHeader>
                {/**
                 * The summary is a `<ul>`, which can't live inside `DialogDescription` (that
                 * primitive renders a `<p>` and putting block elements inside `<p>` is invalid
                 * HTML — React 19 raises a hydration error). Render it as a sibling instead.
                 */}
                <ul className="flex flex-col gap-1 text-muted-foreground text-sm">
                    <li>{t("summaryNew", { count: createCount })}</li>
                    <li>{t("summaryUnchanged", { count: unchangedCount })}</li>
                    {outdatedCount > 0 ? <li>{t("summaryOutdated", { count: outdatedCount })}</li> : null}
                </ul>
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
