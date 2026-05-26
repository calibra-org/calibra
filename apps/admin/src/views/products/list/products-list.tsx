"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import { Plus, PackagePlus, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type FacetedFilterDef,
} from "#/components/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import {
    type CatalogVisibility,
    type StockLevel,
    useProductCountsByStatus,
    useProductsList,
} from "#/lib/products/queries";
import type { AdminProduct, ProductStatus, ProductType, StockStatus } from "#/lib/types";

import { BulkActions } from "./bulk-actions";
import { buildProductColumns } from "./columns";
import { useFavorites } from "./favorite-toggle";
import { useProductFilters } from "./filters";
import { QuickEditPanel } from "./quick-edit/quick-edit-panel";
import { useProductsListShortcuts } from "./shortcuts";
import { ShortcutsDialog } from "#/components/shortcuts-dialog";

const TABLE_ID = "products.list";
const STATUS_TABS: (ProductStatus | "any")[] = ["any", "publish", "draft", "pending"];
const TRASH_TAB = "trash" as const;
const TAB_VALUES: readonly string[] = [...STATUS_TABS, TRASH_TAB];
type TabValue = ProductStatus | "any" | typeof TRASH_TAB;
const LOW_STOCK_THRESHOLD = 5;

/**
 * Top-level client component for the Products list page. Wires the {@link DataTable} abstraction
 * to the products query, hosts the status segmented control, the toolbar's facet filters, and the
 * Quick Edit sub-row. Pagination, sort, search, and every facet value live in the URL via
 * {@link useDataTable}, so deep-linking and the browser back button work without extra plumbing.
 */
export function ProductsList() {
    const t = useTranslations("Products.list");
    const statusT = useTranslations("ProductStatus");
    const stockT = useTranslations("StockStatus");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isFavorite, favorites } = useFavorites();

    const { facets, toggles } = useProductFilters();

    /**
     * Status + Trash live in URL-backed facets even though the tab strip drives them — that way
     * deep links and the browser back button restore the exact tab. They're registered with
     * empty option lists so they don't render as toolbar chips / popovers.
     */
    const facetsWithStatus = useMemo<FacetedFilterDef[]>(
        () => [
            ...facets,
            { paramKey: "status", label: "status", multiple: false, options: [] },
            { paramKey: "trashed", label: "trashed", multiple: false, options: [] },
        ],
        [facets],
    );

    const tableState = useDataTable({
        id: TABLE_ID,
        facets: facetsWithStatus,
        toggles,
        defaultColumnVisibility: { tags: false, views: false, inventory: false, salePeriod: false, createdAt: false },
    });

    const onlyTrashed = tableState.facetValues.trashed?.[0] === "1";
    const status: ProductStatus | "any" = useMemo(() => {
        if (onlyTrashed) return "any";
        const value = tableState.facetValues.status?.[0];
        if (value === "publish" || value === "draft" || value === "pending" || value === "private") return value;
        return "any";
    }, [tableState.facetValues.status, onlyTrashed]);

    const activeTab: TabValue = onlyTrashed ? TRASH_TAB : status;

    const productTypeValue = tableState.facetValues.type?.[0] as ProductType | undefined;
    const stockStatusValue = tableState.facetValues.stock?.[0] as StockStatus | undefined;
    const stockLevelValue = tableState.facetValues.stockLevel?.[0] as StockLevel | undefined;
    const visibilityValue = tableState.facetValues.visibility?.[0] as CatalogVisibility | undefined;
    const categoryId = numericFirst(tableState.facetValues.category);
    const brandId = numericFirst(tableState.facetValues.brand);
    const tagId = numericFirst(tableState.facetValues.tag);
    const favOnly = tableState.toggleValues.fav === true;
    const onSale = tableState.toggleValues.onSale === true;
    const featured = tableState.toggleValues.featured === true;
    const hasImage = tableState.toggleValues.hasImage === true;

    const { data: statusCounts } = useProductCountsByStatus();

    const { data, isPending, isError, refetch } = useProductsList({
        page: tableState.page,
        perPage: tableState.perPage,
        sort:
            tableState.sort !== undefined
                ? tableState.sort.direction === "desc"
                    ? `-${tableState.sort.id}`
                    : tableState.sort.id
                : undefined,
        status,
        type: productTypeValue,
        stockStatus: stockStatusValue,
        stockLevel: stockLevelValue,
        catalogVisibility: visibilityValue,
        categoryId,
        brandId,
        tagId,
        onSale: onSale ? true : undefined,
        featured: featured ? true : undefined,
        hasImage: hasImage ? true : undefined,
        onlyTrashed: onlyTrashed ? true : undefined,
        favoriteIds: favOnly ? Array.from(favorites) : undefined,
        search: tableState.q.length > 0 ? tableState.q : undefined,
    });

    const rows = data?.data ?? [];
    const meta = data?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

    /**
     * Quick Edit expansion is keyed by the TanStack row id (a stringified product id). Driving
     * it from a single piece of state here enforces single-row expansion across both the menu
     * trigger and the keyboard `e` shortcut.
     */
    const [expandedRowId, setExpandedRowId] = useState<string | undefined>(undefined);
    const onToggleQuickEdit = useCallback(
        (rowId: string) => setExpandedRowId((current) => (current === rowId ? undefined : rowId)),
        [],
    );
    const onOpenDetail = useCallback((row: AdminProduct) => router.push(`/products/${row.id}` as never), [router]);

    const onHideColumn = useCallback(
        (id: string) => tableState.setColumnVisibility({ ...tableState.columnVisibility, [id]: false }),
        [tableState.setColumnVisibility, tableState.columnVisibility],
    );

    const columns: ColumnDef<AdminProduct>[] = useMemo(
        () =>
            buildProductColumns({
                locale,
                sort: tableState.sort,
                onSort: tableState.setSort,
                onHideColumn,
                onToggleQuickEdit,
                onOpenDetail,
                isFavorite,
                lowStockThreshold: LOW_STOCK_THRESHOLD,
                t,
                statusT,
                stockT,
                sortLabels: { asc: t("sortAsc"), desc: t("sortDesc"), hide: t("hideColumn") },
            }),
        [
            isFavorite,
            locale,
            onHideColumn,
            onOpenDetail,
            onToggleQuickEdit,
            statusT,
            stockT,
            t,
            tableState.setSort,
            tableState.sort,
        ],
    );

    const columnVisibilityItems = useMemo(
        () =>
            columns
                .filter(
                    (col): col is typeof col & { id: string } =>
                        typeof col.id === "string" && col.id !== "select" && col.id !== "actions",
                )
                .map((col) => ({
                    id: col.id,
                    label: t(`columns.${col.id}` as never),
                    canHide: col.enableHiding !== false,
                })),
        [columns, t],
    );

    const activeChips = useMemo(() => {
        const out: { key: string; value: string; label: string }[] = [];
        for (const facet of facets) {
            const values = tableState.facetValues[facet.paramKey] ?? [];
            for (const value of values) {
                const option = facet.options.find((opt) => opt.value === value);
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${option?.label ?? value}` });
            }
        }
        return out;
    }, [facets, tableState.facetValues]);

    const onTabChange = (value: string) => {
        if (!TAB_VALUES.includes(value)) return;
        if (value === TRASH_TAB) {
            tableState.setFacetValues("status", []);
            tableState.setFacetValues("trashed", ["1"]);
            return;
        }
        tableState.setFacetValues("trashed", []);
        if (value === "any") {
            tableState.setFacetValues("status", []);
            return;
        }
        tableState.setFacetValues("status", [value]);
    };

    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    useProductsListShortcuts({
        onFocusSearch: () => {
            const el = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder]');
            el?.focus();
        },
        onNew: () => router.push("/products/new" as never),
        onRefresh: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
        onOpenShortcuts: () => setShortcutsOpen(true),
        onClearSelection: () => tableState.setSelected(new Set<string>()),
    });

    const shortcutGroups = useMemo(() => {
        const shortcutT = (key: string): string => t(`shortcuts.${key}` as never);
        return [
            {
                title: shortcutT("navigate"),
                items: [
                    { label: shortcutT("search"), keys: ["/"] },
                    { label: shortcutT("new"), keys: ["n"] },
                    { label: shortcutT("refresh"), keys: ["r"] },
                    { label: shortcutT("open"), keys: ["?"] },
                ],
            },
            {
                title: t("rowActionsLabel"),
                items: [
                    { label: shortcutT("edit"), keys: ["E"] },
                    { label: shortcutT("quickEdit"), keys: ["Q"] },
                    { label: shortcutT("duplicate"), keys: ["D"] },
                    { label: shortcutT("trash"), keys: ["Del"] },
                    { label: shortcutT("selectAll"), keys: ["Shift", "A"] },
                    { label: shortcutT("clearSelection"), keys: ["Esc"] },
                ],
            },
        ];
    }, [t]);

    const headerSubtitle =
        data === undefined ? t("loadingTotal") : t("totalProducts", { count: formatNumber(meta.total, locale) });

    const hasNoFiltersOrSearch = !tableState.hasActiveFilters && tableState.q.length === 0 && !onlyTrashed;
    const showOnboardingHint = hasNoFiltersOrSearch && !isPending && !isError && rows.length === 0;

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{headerSubtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={(props) => (
                                <Button {...props} variant="outline">
                                    {t("secondaryActions")}
                                </Button>
                            )}
                        />
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push("/products/import" as never)}>
                                {t("import")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push("/products/export" as never)}>
                                {t("export")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => refetch()}>{t("refresh")}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => router.push("/products/new" as never)}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addProduct")}
                    </Button>
                </div>
            </header>

            {/**
             * Line-variant tabs with always-on full-width bottom border + animated primary
             * underline that slides between active selections. Each tab label inlines the
             * parenthetical count exactly like the Positions / Open Orders bar in the reference.
             */}
            <Tabs value={activeTab} onValueChange={onTabChange} variant="line" aria-label={t("title")}>
                <TabsList className="h-10 gap-6 px-0">
                    {STATUS_TABS.map((value) => {
                        const count = statusCounts?.[value];
                        const label = value === "any" ? t("status.any") : statusT(value as ProductStatus);
                        return (
                            <TabsTrigger key={value} value={value} className="px-0">
                                <span>{label}</span>
                                {count !== undefined && (
                                    <span className="ms-1 text-muted-foreground/80 tabular-nums">
                                        ({formatNumber(count, locale)})
                                    </span>
                                )}
                            </TabsTrigger>
                        );
                    })}
                    <TabsTrigger value={TRASH_TAB} className="px-0">
                        <span>{t("status.trash")}</span>
                        {statusCounts?.trash !== undefined && (
                            <span className="ms-1 text-muted-foreground/80 tabular-nums">
                                ({formatNumber(statusCounts.trash, locale)})
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {showOnboardingHint && (
                <OnboardingHint
                    id="products.list.empty"
                    icon={PackagePlus}
                    title={t("emptyHint.title")}
                    description={t("emptyHint.description")}
                    cta={{ label: t("emptyHint.cta"), onClick: () => router.push("/products/new" as never) }}
                    variant="card"
                />
            )}

            <DataTable<AdminProduct>
                data={rows}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={meta}
                perPageOptions={tableState.perPageOptions}
                onPageChange={tableState.setPage}
                onPerPageChange={tableState.setPerPage}
                sort={tableState.sort}
                onSortChange={tableState.setSort}
                selectedIds={tableState.selectedIds}
                onSelectedIdsChange={tableState.setSelected}
                columnVisibility={tableState.columnVisibility}
                onColumnVisibilityChange={tableState.setColumnVisibility}
                columnOrder={tableState.columnOrder}
                onColumnOrderChange={tableState.setColumnOrder}
                density={tableState.density}
                isLoading={isPending}
                isError={isError}
                onRetry={() => refetch()}
                hasActiveFilters={tableState.hasActiveFilters}
                onClearFilters={tableState.clearAllFilters}
                onRowOpen={onOpenDetail}
                expandedRowId={expandedRowId}
                onExpandedRowIdChange={setExpandedRowId}
                renderSubComponent={(row: Row<AdminProduct>) => (
                    <QuickEditPanel product={row.original} onClose={() => setExpandedRowId(undefined)} />
                )}
                renderCard={(row) => (
                    <ProductCard
                        row={row.original}
                        isFavorite={isFavorite(row.original.id)}
                        onQuickEdit={(product) => onToggleQuickEdit(String(product.id))}
                        onOpenDetail={onOpenDetail}
                    />
                )}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("searchPlaceholder")}
                            q={tableState.q}
                            onQChange={tableState.setQ}
                            facets={facets}
                            facetValues={tableState.facetValues}
                            onFacetValuesChange={tableState.setFacetValues}
                            toggles={toggles}
                            toggleValues={tableState.toggleValues}
                            onToggleChange={tableState.setToggleValue}
                            hasActiveFilters={tableState.hasActiveFilters}
                            onClearAll={tableState.clearAllFilters}
                            onRefresh={() => {
                                void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
                            }}
                            labels={{
                                clearAll: t("clearAll"),
                                refresh: t("refresh"),
                                selectedCount: (n) => formatNumber(n, locale),
                                clearFilter: t("clearFilter"),
                            }}
                            rightSlot={
                                <DataTableViewOptions
                                    columns={columnVisibilityItems}
                                    visibility={tableState.columnVisibility}
                                    onVisibilityChange={tableState.setColumnVisibility}
                                    density={tableState.density}
                                    onDensityChange={tableState.setDensity}
                                    labels={{
                                        trigger: t("viewOptions"),
                                        columnsHeading: t("columnsHeading"),
                                        densityHeading: t("densityHeading"),
                                        density: {
                                            comfortable: t("density.comfortable"),
                                            cozy: t("density.cozy"),
                                            compact: t("density.compact"),
                                        },
                                    }}
                                />
                            }
                        />
                        <ActiveFilterChips
                            chips={activeChips}
                            onRemove={(key, value) => {
                                const current = tableState.facetValues[key] ?? [];
                                tableState.setFacetValues(
                                    key,
                                    current.filter((item) => item !== value),
                                );
                            }}
                        />
                    </div>
                }
                labels={{
                    empty: { title: t("empty"), description: t("emptyDescription") },
                    filtered: { title: t("filteredEmpty"), description: t("filteredEmptyDescription") },
                    clearFiltersLabel: t("clearAll"),
                    errorTitle: t("loadError"),
                    errorRetry: t("retry"),
                    pagination: {
                        rowsPerPage: t("rowsPerPage"),
                        showing: (from, to, total) =>
                            t("showing", {
                                from: formatNumber(from, locale),
                                to: formatNumber(to, locale),
                                total: formatNumber(total, locale),
                            }),
                        selectedOf: (selected, total) =>
                            t("selectedOf", { selected: formatNumber(selected, locale), total: formatNumber(total, locale) }),
                        first: t("first"),
                        previous: t("previous"),
                        next: t("next"),
                        last: t("last"),
                        pageOf: (page, lastPage) =>
                            t("pageOf", { page: formatNumber(page, locale), lastPage: formatNumber(lastPage, locale) }),
                    },
                }}
                formatNumber={(value) => formatNumber(value, locale)}
                skeletonColumnWidths={[2, 1, 2, 6, 3, 3, 3, 3, 2, 3, 1]}
                bulkActions={(bulk) => (
                    <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearSelection} onTrashTab={onlyTrashed} />
                )}
            />

            <ShortcutsDialog
                open={shortcutsOpen}
                onOpenChange={setShortcutsOpen}
                title={t("shortcuts.title")}
                groups={shortcutGroups}
            />
        </section>
    );
}

function numericFirst(values: string[] | undefined): number | undefined {
    if (values === undefined || values.length === 0) return undefined;
    const numeric = Number(values[0]);
    return Number.isFinite(numeric) ? numeric : undefined;
}

interface ProductCardProps {
    row: AdminProduct;
    isFavorite: boolean;
    onQuickEdit: (row: AdminProduct) => void;
    onOpenDetail: (row: AdminProduct) => void;
}

/** Mobile card view — keeps the table headless when the viewport is too narrow for columns. */
function ProductCard({ row, isFavorite: _isFavorite, onQuickEdit, onOpenDetail }: ProductCardProps) {
    return (
        <article className="flex items-start gap-3">
            {row.imageUrl !== null ? (
                // biome-ignore lint/performance/noImgElement: mock CDN
                <img src={row.imageUrl} alt={row.name.fa} className="size-12 rounded-md object-cover" loading="lazy" />
            ) : (
                <div className="size-12 rounded-md bg-muted" aria-hidden="true" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
                <button
                    type="button"
                    onClick={() => onOpenDetail(row)}
                    className="truncate text-start font-medium text-foreground hover:underline"
                >
                    {row.name.fa || `#${row.id}`}
                </button>
                <p className="font-mono text-muted-foreground text-xs">{row.sku || "—"}</p>
                <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => onQuickEdit(row)} className="text-primary text-xs hover:underline">
                        <Star className="me-1 inline size-3" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </article>
    );
}
