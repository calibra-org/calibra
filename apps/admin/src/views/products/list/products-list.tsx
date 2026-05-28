"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import { PackagePlus, Plus, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { ShortcutsDialog } from "#/components/shortcuts-dialog";
import { Button } from "#/components/ui/button";
import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    useColumnState,
    useSelectionState,
} from "#/components/ui/data-grid";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { type StockLevel, useProductCountsByStatus, useProductsList } from "#/lib/products/queries";
import {
    type FacetColumnMap,
    singleSortToTableView,
    tableViewToSingleSort,
    useFacetValuesFromQuery,
    useSetFacetValue,
    useTableView,
} from "#/lib/table-view";
import type { AdminProduct, ProductStatus } from "#/lib/types";

import { BulkActions } from "./bulk-actions";
import { buildProductColumns } from "./columns";
import { useFavorites } from "./favorite-toggle";
import { useProductFilters } from "./filters";
import { QuickEditPanel } from "./quick-edit/quick-edit-panel";
import { useProductsListShortcuts } from "./shortcuts";

const TABLE_ID = "products.list";
const STATUS_TABS: (ProductStatus | "any")[] = ["any", "publish", "draft", "pending"];
const TRASH_TAB = "trash" as const;
const TAB_VALUES: readonly string[] = [...STATUS_TABS, TRASH_TAB];
type TabValue = ProductStatus | "any" | typeof TRASH_TAB;
const LOW_STOCK_THRESHOLD = 5;

/**
 * Toolbar facets that are filterable columns ride the grammar as `filter[]=<col>:in:…` (read from +
 * written to `query.filter`). `type` is the `type` column; `visibility` projects onto the
 * `catalog_visibility` column. Every other facet (`stock_status`, `stock_level`, pivots) is a
 * bespoke extra the runtime can't model as a column WHERE.
 */
const FACET_COLUMN_MAP: FacetColumnMap = {
    type: { field: "type", op: "in" },
    visibility: { field: "catalog_visibility", op: "in" },
};

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
     * URL-as-wire state. `page` / `limit` / `sort[]` plus the column facets (`type`,
     * `catalog_visibility`, `featured`) come from the TableView grammar in `query`; everything
     * below is a bespoke top-level extra keyed by its EXACT wire key so the URL, the params, and
     * the request read identically. The tab strip is computed from `status` + `only_trashed`.
     */
    const tv = useTableView({
        extras: {
            q: parseAsString.withDefault(""),
            status: parseAsString.withDefault(""),
            only_trashed: parseAsBoolean.withDefault(false),
            stock_status: parseAsString.withDefault(""),
            stock_level: parseAsString.withDefault(""),
            category: parseAsString.withDefault(""),
            brand: parseAsString.withDefault(""),
            tag: parseAsString.withDefault(""),
            on_sale: parseAsBoolean.withDefault(false),
            has_image: parseAsBoolean.withDefault(false),
        },
    });

    /** Favourites is a CLIENT filter — the API has no support for it, so it stays out of the
     *  URL-as-wire model entirely (local state, never serialized, never sent). */
    const [fav, setFav] = useState(false);

    const ui = useColumnState({
        id: TABLE_ID,
        defaultColumnVisibility: { tags: false, views: false, inventory: false, salePeriod: false, createdAt: false },
    });

    const selection = useSelectionState();

    const onlyTrashed = tv.only_trashed;
    const status: ProductStatus | "any" = useMemo(() => {
        if (onlyTrashed) return "any";
        const value = tv.status;
        if (value === "publish" || value === "draft" || value === "pending" || value === "private") return value;
        return "any";
    }, [tv.status, onlyTrashed]);

    const activeTab: TabValue = onlyTrashed ? TRASH_TAB : status;

    /** `type` + `visibility` read from `filter[]` (grammar-first); the remaining facets are
     *  bespoke extras projected onto the same `Record<string, string[]>` shape the toolbar wants. */
    const columnFacetValues = useFacetValuesFromQuery(tv.query, FACET_COLUMN_MAP);
    const setColumnFacet = useSetFacetValue(tv.query, tv.setFilter, FACET_COLUMN_MAP);

    const facetValues = useMemo<Record<string, string[]>>(
        () => ({
            ...columnFacetValues,
            stock_status: csvToArray(tv.stock_status),
            stock_level: tv.stock_level.length > 0 ? [tv.stock_level] : [],
            category: csvToArray(tv.category),
            brand: csvToArray(tv.brand),
            tag: csvToArray(tv.tag),
        }),
        [columnFacetValues, tv.stock_status, tv.stock_level, tv.category, tv.brand, tv.tag],
    );

    const setFacetValues = useCallback(
        (key: string, values: string[]) => {
            if (key === "type" || key === "visibility") {
                setColumnFacet(key, values);
                return;
            }
            switch (key) {
                case "stock_status":
                    tv.setStock_status(values.join(","));
                    break;
                case "stock_level":
                    tv.setStock_level(values[0] ?? "");
                    break;
                case "category":
                    tv.setCategory(values.join(","));
                    break;
                case "brand":
                    tv.setBrand(values.join(","));
                    break;
                case "tag":
                    tv.setTag(values.join(","));
                    break;
            }
        },
        [setColumnFacet, tv],
    );

    /** `featured` is a filterable column toggle → `filter[]=featured:eq:true`; `on_sale` /
     *  `has_image` are bespoke extras; `fav` is client-only local state. */
    const featuredActive = useMemo(
        () => tv.query.filter.some((f) => f.field === "featured" && f.op === "eq" && f.value === true),
        [tv.query.filter],
    );
    const toggleValues = useMemo<Record<string, boolean>>(
        () => ({ fav, onSale: tv.on_sale, featured: featuredActive, hasImage: tv.has_image }),
        [fav, tv.on_sale, featuredActive, tv.has_image],
    );
    const setToggleValue = useCallback(
        (key: string, value: boolean) => {
            switch (key) {
                case "fav":
                    setFav(value);
                    break;
                case "onSale":
                    tv.setOn_sale(value);
                    break;
                case "featured": {
                    const others = tv.query.filter.filter((f) => f.field !== "featured");
                    tv.setFilter(value ? [...others, { field: "featured", op: "eq", value: true }] : others);
                    break;
                }
                case "hasImage":
                    tv.setHas_image(value);
                    break;
            }
        },
        [tv],
    );

    const sort = tableViewToSingleSort(tv.query.sort);
    const setSort = useCallback((next: typeof sort) => tv.setSort(singleSortToTableView(next)), [tv.setSort]);

    const { data: statusCounts } = useProductCountsByStatus();

    const { data, isPending, isError, refetch } = useProductsList({
        query: tv.query,
        q: tv.q.length > 0 ? tv.q : undefined,
        status,
        stock_status: tv.stock_status.length > 0 ? tv.stock_status : undefined,
        stock_level: tv.stock_level.length > 0 ? (tv.stock_level as StockLevel) : undefined,
        category: tv.category.length > 0 ? tv.category : undefined,
        brand: tv.brand.length > 0 ? tv.brand : undefined,
        tag: tv.tag.length > 0 ? tv.tag : undefined,
        on_sale: tv.on_sale ? true : undefined,
        has_image: tv.has_image ? true : undefined,
        only_trashed: onlyTrashed ? true : undefined,
        favoriteIds: fav ? Array.from(favorites) : undefined,
    });

    const rows = data?.data ?? [];
    const meta = data?.meta ?? { page: tv.query.page, limit: tv.query.limit, total: 0, lastPage: 1 };

    const hasActiveFilters = useMemo(
        () =>
            tv.q.length > 0 ||
            tv.query.filter.length > 0 ||
            tv.stock_status.length > 0 ||
            tv.stock_level.length > 0 ||
            tv.category.length > 0 ||
            tv.brand.length > 0 ||
            tv.tag.length > 0 ||
            fav ||
            tv.on_sale ||
            tv.has_image,
        [tv.q, tv.query.filter, tv.stock_status, tv.stock_level, tv.category, tv.brand, tv.tag, fav, tv.on_sale, tv.has_image],
    );

    const clearAllFilters = useCallback(() => {
        tv.setQ("");
        tv.clearFilters();
        tv.setStock_status("");
        tv.setStock_level("");
        tv.setCategory("");
        tv.setBrand("");
        tv.setTag("");
        setFav(false);
        tv.setOn_sale(false);
        tv.setHas_image(false);
    }, [tv]);

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
        (id: string) => ui.setColumnVisibility({ ...ui.columnVisibility, [id]: false }),
        [ui.setColumnVisibility, ui.columnVisibility],
    );

    const columns: ColumnDef<AdminProduct>[] = useMemo(
        () =>
            buildProductColumns({
                locale,
                sort,
                onSort: setSort,
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
        [isFavorite, locale, onHideColumn, onOpenDetail, onToggleQuickEdit, statusT, stockT, t, sort, setSort],
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
            const values = facetValues[facet.paramKey] ?? [];
            for (const value of values) {
                const option = facet.options.find((opt) => opt.value === value);
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${option?.label ?? value}` });
            }
        }
        return out;
    }, [facets, facetValues]);

    const onTabChange = useCallback(
        (value: string) => {
            if (!TAB_VALUES.includes(value)) return;
            if (value === TRASH_TAB) {
                tv.setStatus("");
                tv.setOnly_trashed(true);
                return;
            }
            tv.setOnly_trashed(false);
            tv.setStatus(value === "any" ? "" : value);
        },
        [tv],
    );

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
        onClearSelection: () => selection.setSelected(new Set<string>()),
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

    const hasNoFiltersOrSearch = !hasActiveFilters && !onlyTrashed;
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
                limitOptions={[10, 20, 50, 100]}
                onPageChange={tv.setPage}
                onLimitChange={tv.setLimit}
                sort={sort}
                onSortChange={setSort}
                selectedIds={selection.selectedIds}
                onSelectedIdsChange={selection.setSelected}
                columnVisibility={ui.columnVisibility}
                onColumnVisibilityChange={ui.setColumnVisibility}
                columnOrder={ui.columnOrder}
                onColumnOrderChange={ui.setColumnOrder}
                density={ui.density}
                isLoading={isPending}
                isError={isError}
                onRetry={() => refetch()}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearAllFilters}
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
                            q={tv.q}
                            onQChange={tv.setQ}
                            facets={facets}
                            facetValues={facetValues}
                            onFacetValuesChange={setFacetValues}
                            toggles={toggles}
                            toggleValues={toggleValues}
                            onToggleChange={setToggleValue}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
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
                                    visibility={ui.columnVisibility}
                                    onVisibilityChange={ui.setColumnVisibility}
                                    density={ui.density}
                                    onDensityChange={ui.setDensity}
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
                                const current = facetValues[key] ?? [];
                                setFacetValues(
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
                /**
                 * Pin select / favorite / image / name to the inline-start edge so the operator's
                 * primary anchors (selection + the product itself) stay visible while the row
                 * scrolls horizontally. Only `name` — the last column in the cluster — paints the
                 * scroll shadow; interior pinned columns sit flat behind it.
                 */
                stickyColumns={{ start: ["select", "favorite", "image", "name"], end: ["actions"] }}
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

/** Split a comma-joined facet extra (`"5,8"`) into the `string[]` shape the toolbar facets want. */
function csvToArray(value: string): string[] {
    return value.length > 0 ? value.split(",") : [];
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
