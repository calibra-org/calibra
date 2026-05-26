"use client";

import type { Locale } from "@calibra/shared/i18n";
import { AlertTriangle, Eye, EyeOff, ImageOff, Tag as TagIcon } from "lucide-react";
import type { useTranslations } from "next-intl";

type TFunction = ReturnType<typeof useTranslations>;

import { type ColumnDef, DataTableColumnHeader, type SortState } from "#/components/ui/data-grid";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { formatDate, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useBulkUpdateProducts } from "#/lib/products/mutations";
import type { AdminProduct, ProductStatus, StockStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

import { FavoriteToggle } from "./favorite-toggle";
import { RowActions } from "./row-actions";

const productStatusTone: Record<ProductStatus, StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

const stockTone: Record<StockStatus, StatusTone> = {
    instock: "success",
    outofstock: "danger",
    onbackorder: "warning",
};

interface ColumnContext {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    /** Called when the row should toggle its inline Quick Edit. Receives the TanStack row id. */
    onToggleQuickEdit: (rowId: string) => void;
    onOpenDetail: (row: AdminProduct) => void;
    isFavorite: (id: number) => boolean;
    lowStockThreshold: number;
    t: TFunction;
    statusT: TFunction;
    stockT: TFunction;
    sortLabels: { asc: string; desc: string; hide: string };
}

/**
 * Builds the table's `ColumnDef[]`. Lives in its own module so the page composition stays
 * readable and Storybook-ish smoke tests can mount the columns in isolation.
 */
export function buildProductColumns(ctx: ColumnContext): ColumnDef<AdminProduct>[] {
    const sortableHeader = (columnId: string, title: string, className?: string) => () => (
        <DataTableColumnHeader
            columnId={columnId}
            title={title}
            sort={ctx.sort}
            onSort={ctx.onSort}
            onHide={() => ctx.onHideColumn(columnId)}
            labels={ctx.sortLabels}
            className={className}
        />
    );

    return [
        {
            id: "select",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2" },
            header: ({ table }) => {
                const all = table.getIsAllRowsSelected();
                const some = table.getIsSomeRowsSelected();
                return (
                    <Checkbox
                        checked={all}
                        indeterminate={!all && some}
                        onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
                        aria-label={ctx.t("selectAll")}
                    />
                );
            },
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(value === true)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={ctx.t("selectRow")}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 44,
        },
        {
            id: "favorite",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2" },
            header: () => (
                <span className="sr-only" aria-hidden="true">
                    {ctx.t("columns.favorite")}
                </span>
            ),
            cell: ({ row }) => <FavoriteToggle productId={row.original.id} initialIsFavorite={ctx.isFavorite(row.original.id)} />,
            enableSorting: false,
            size: 48,
        },
        {
            id: "image",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2" },
            header: () => (
                <span className="sr-only" aria-hidden="true">
                    {ctx.t("columns.image")}
                </span>
            ),
            cell: ({ row }) => {
                if (row.original.imageUrl === null) {
                    return (
                        <div className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
                            <ImageOff className="size-4" aria-hidden="true" />
                        </div>
                    );
                }
                return (
                    // biome-ignore lint/performance/noImgElement: mock CDN avoids next/image remote-patterns config
                    <img
                        src={row.original.imageUrl}
                        alt={row.original.name[ctx.locale]}
                        className="size-10 rounded-md object-cover"
                        loading="lazy"
                    />
                );
            },
            enableSorting: false,
            size: 56,
        },
        {
            id: "name",
            header: sortableHeader("name", ctx.t("columns.name")),
            size: 300,
            cell: ({ row }) => {
                const product = row.original;
                return (
                    <div className="flex min-w-0 flex-col overflow-hidden">
                        <Link
                            href={`/products/${product.id}` as never}
                            className="truncate font-medium text-foreground hover:text-primary hover:underline"
                        >
                            {product.name[ctx.locale] || `#${product.id}`}
                        </Link>
                        <div className="invisible flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-opacity group-focus-within/row:visible group-focus-within/row:opacity-100 group-hover/row:visible group-hover/row:opacity-100">
                            <button
                                type="button"
                                className="shrink-0 text-muted-foreground hover:text-foreground hover:underline"
                                onClick={() => ctx.onOpenDetail(product)}
                            >
                                {ctx.t("actions.edit")}
                            </button>
                            <Separator />
                            <button
                                type="button"
                                className="shrink-0 text-muted-foreground hover:text-foreground hover:underline"
                                onClick={() => ctx.onToggleQuickEdit(String(product.id))}
                            >
                                {ctx.t("actions.quickEdit")}
                            </button>
                            <Separator />
                            <Link
                                href={`/product/${product.slug[ctx.locale]}` as never}
                                target="_blank"
                                className="shrink-0 text-muted-foreground hover:text-foreground hover:underline"
                            >
                                {ctx.t("actions.view")}
                            </Link>
                        </div>
                    </div>
                );
            },
            enableSorting: true,
        },
        {
            id: "sku",
            header: sortableHeader("sku", ctx.t("columns.sku")),
            size: 160,
            cell: ({ row }) => (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        void navigator.clipboard?.writeText(row.original.sku);
                    }}
                    className="block max-w-full truncate font-mono text-muted-foreground text-xs hover:text-foreground"
                    title={row.original.sku || ctx.t("copySku")}
                >
                    {row.original.sku || "—"}
                </button>
            ),
        },
        {
            id: "stock",
            header: sortableHeader("stock", ctx.t("columns.stock")),
            meta: { cellClassName: "text-start" },
            cell: ({ row }) => (
                <StockCell
                    quantity={row.original.stockQuantity}
                    stockStatus={row.original.stockStatus}
                    lowStock={row.original.lowStock}
                    lowStockThreshold={ctx.lowStockThreshold}
                    locale={ctx.locale}
                    stockT={ctx.stockT}
                    t={ctx.t}
                />
            ),
            size: 168,
        },
        {
            id: "visibility",
            header: () => (
                <DataTableColumnHeader
                    columnId="visibility"
                    title={ctx.t("columns.visibility")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    onHide={() => ctx.onHideColumn("visibility")}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) => <VisibilityCell productId={row.original.id} value={row.original.catalogVisibility} t={ctx.t} />,
            enableSorting: false,
            size: 132,
        },
        {
            id: "salePeriod",
            header: () => (
                <DataTableColumnHeader
                    columnId="salePeriod"
                    title={ctx.t("columns.salePeriod")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    onHide={() => ctx.onHideColumn("salePeriod")}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) => (
                <SalePeriodCell from={row.original.saleStartsAt} to={row.original.saleEndsAt} locale={ctx.locale} />
            ),
            enableSorting: false,
            size: 160,
        },
        {
            id: "inventory",
            header: () => (
                <DataTableColumnHeader
                    columnId="inventory"
                    title={ctx.t("columns.inventory")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    onHide={() => ctx.onHideColumn("inventory")}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) =>
                row.original.stockQuantity === null ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <span className="tabular-nums">{formatNumber(row.original.stockQuantity, ctx.locale)}</span>
                ),
            enableSorting: false,
            size: 100,
        },
        {
            id: "createdAt",
            header: sortableHeader("created_at", ctx.t("columns.createdAt")),
            cell: ({ row }) => (
                <time
                    dateTime={row.original.createdAt}
                    title={formatDate(row.original.createdAt, ctx.locale)}
                    className="text-muted-foreground text-xs"
                >
                    {formatDate(row.original.createdAt, ctx.locale)}
                </time>
            ),
            size: 140,
        },
        {
            id: "price",
            header: sortableHeader("price", ctx.t("columns.price")),
            meta: { cellClassName: "text-start" },
            cell: ({ row }) => {
                const product = row.original;
                return (
                    <div className="flex flex-col items-start text-start tabular-nums">
                        <span className="font-medium">{formatMoney(product.salePrice ?? product.regularPrice, ctx.locale)}</span>
                        {product.salePrice !== null && (
                            <span className="text-muted-foreground text-xs line-through">
                                {formatMoney(product.regularPrice, ctx.locale)}
                            </span>
                        )}
                    </div>
                );
            },
            size: 200,
        },
        {
            id: "categories",
            header: () => (
                <DataTableColumnHeader
                    columnId="categories"
                    title={ctx.t("columns.categories")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) => <CategoriesCell ids={row.original.categoryIds} t={ctx.t} />,
            enableSorting: false,
        },
        {
            id: "tags",
            header: () => (
                <DataTableColumnHeader
                    columnId="tags"
                    title={ctx.t("columns.tags")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) => <CategoriesCell ids={row.original.tagIds} t={ctx.t} />,
            enableSorting: false,
        },
        {
            id: "brand",
            header: () => (
                <DataTableColumnHeader
                    columnId="brand"
                    title={ctx.t("columns.brand")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) =>
                row.original.brandId !== null ? (
                    <Badge variant="outline" className="font-normal">
                        #{row.original.brandId}
                    </Badge>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            enableSorting: false,
            size: 120,
        },
        {
            id: "date",
            header: sortableHeader("date", ctx.t("columns.date")),
            cell: ({ row }) => {
                const product = row.original;
                return (
                    <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone={productStatusTone[product.status]}>{ctx.statusT(product.status)}</StatusBadge>
                        <time
                            dateTime={product.updatedAt}
                            title={formatDate(product.updatedAt, ctx.locale)}
                            className="text-muted-foreground text-xs"
                        >
                            {formatRelativeTime(product.updatedAt, ctx.locale)}
                        </time>
                    </div>
                );
            },
            size: 160,
        },
        {
            id: "views",
            header: sortableHeader("views", ctx.t("columns.views")),
            meta: { cellClassName: "text-end" },
            cell: () => <span className="text-muted-foreground text-xs">—</span>,
            size: 100,
        },
        {
            id: "actions",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2" },
            header: () => (
                <span className="sr-only" aria-hidden="true">
                    {ctx.t("columns.actions")}
                </span>
            ),
            cell: ({ row }) => (
                <RowActions
                    product={row.original}
                    onQuickEdit={() => ctx.onToggleQuickEdit(row.id)}
                    onOpenDetail={() => ctx.onOpenDetail(row.original)}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 56,
        },
    ];
}

function Separator() {
    return <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />;
}

interface StockCellProps {
    quantity: number | null;
    stockStatus: StockStatus;
    lowStock: boolean;
    lowStockThreshold: number;
    locale: Locale;
    stockT: TFunction;
    t: TFunction;
}

/**
 * Compact stock cell. Badge color is binary — green when there's stock, red when the rolled-up
 * total is 0. The "low stock" state lives *outside* the badge as a separate warning chip so the
 * primary in-stock signal stays unambiguously green; the operator scans down the column and
 * spots "warning next to in-stock" without re-reading every chip.
 *
 *   ۱۸۱ موجود                                ← plain green chip
 *   ۳ موجود   ⚠ کم‌موجود                       ← green chip + amber warning chip beside it
 *   ۰ ناموجود                                ← red chip
 *
 * For products without an inventory row (`manage_stock=false` / untracked) the cell renders the
 * status-only chip without a quantity, since the number would always be `0` and read as out of
 * stock by mistake.
 */
function StockCell({ quantity, stockStatus, lowStock, lowStockThreshold, locale, stockT, t }: StockCellProps) {
    const tracked = quantity !== null;
    const isOut = tracked && quantity <= 0;
    const isLow = !isOut && tracked && (lowStock || (quantity ?? 0) <= lowStockThreshold);
    const isInStock = !isOut;

    const wrapCls = isInStock
        ? "border-success/30 bg-success/10 text-success dark:text-success"
        : "border-danger/30 bg-danger/10 text-danger dark:text-danger";
    const label = stockT(isInStock ? "instock" : "outofstock");

    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] leading-none", wrapCls)}
                title={tracked ? `${formatNumber(quantity ?? 0, locale)} — ${label}` : label}
            >
                {tracked && <span className="font-semibold tabular-nums">{formatNumber(quantity ?? 0, locale)}</span>}
                <span className="font-medium">{label}</span>
            </span>
            {isLow && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger
                            render={(props) => (
                                <button
                                    type="button"
                                    aria-label={t("lowStock")}
                                    {...props}
                                    className="inline-flex size-5 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning dark:text-warning"
                                >
                                    <AlertTriangle className="size-3" aria-hidden="true" />
                                </button>
                            )}
                        />
                        <TooltipContent>{t("lowStock")}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </span>
    );
}

interface VisibilityCellProps {
    productId: number;
    value: AdminProduct["catalogVisibility"];
    t: TFunction;
}

/**
 * Inline visibility toggle. Clicking flips between `hidden` and the previous shown state
 * (default `visible`); intermediate states `catalog` / `search` collapse to `hidden` on toggle.
 * Wire through `useBulkUpdateProducts({ ids: [id], catalogVisibility: … })` so the same
 * server-side audit + cache invalidation as the bulk action runs for free.
 */
function VisibilityCell({ productId, value, t }: VisibilityCellProps) {
    const mutation = useBulkUpdateProducts();
    const isHidden = value === "hidden";
    const Icon = isHidden ? EyeOff : Eye;
    const label = t(isHidden ? "columns.visibilityHidden" : "columns.visibilityShown");

    const onToggle = () => {
        if (mutation.isPending) return;
        mutation.mutate({
            ids: [productId],
            catalogVisibility: isHidden ? "visible" : "hidden",
        });
    };

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={mutation.isPending}
            aria-pressed={!isHidden}
            title={label}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-foreground text-xs transition-colors hover:bg-accent hover:text-foreground",
                isHidden && "text-muted-foreground",
                mutation.isPending && "opacity-60",
            )}
        >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
        </button>
    );
}

interface SalePeriodCellProps {
    from: string | null;
    to: string | null;
    locale: Locale;
}

function SalePeriodCell({ from, to, locale }: SalePeriodCellProps) {
    if (from === null && to === null) return <span className="text-muted-foreground">—</span>;
    const display = [from, to].map((iso) => (iso === null ? "…" : formatDate(iso, locale))).join(" → ");
    return (
        <Badge variant="outline" className="font-normal text-xs">
            <TagIcon className="size-3" aria-hidden="true" />
            {display}
        </Badge>
    );
}

interface CategoriesCellProps {
    ids: number[];
    t: TFunction;
}

/**
 * Renders the first two ids as chips and collapses the remainder into a `+N` chip that pops a
 * full list on hover. Names aren't included in `AdminProduct` (list endpoint doesn't expand
 * relations), so we display ids — when the API adds names to the list shape, swap them in.
 */
function CategoriesCell({ ids, t }: CategoriesCellProps) {
    if (ids.length === 0) return <span className="text-muted-foreground">—</span>;
    const head = ids.slice(0, 2);
    const tail = ids.slice(2);
    return (
        <div className="flex items-center gap-1">
            {head.map((id) => (
                <Badge key={id} variant="outline" className="font-normal">
                    #{id}
                </Badge>
            ))}
            {tail.length > 0 && (
                <HoverCard>
                    <HoverCardTrigger
                        render={(props) => (
                            <button {...props} type="button" className={cn("rounded")}>
                                <Badge variant="secondary" className="text-[10px] tabular-nums">
                                    +{tail.length}
                                </Badge>
                            </button>
                        )}
                    />
                    <HoverCardContent>
                        <p className="mb-1 font-medium text-xs">{t("allCategories")}</p>
                        <div className="flex flex-wrap gap-1">
                            {ids.map((id) => (
                                <Badge key={id} variant="outline" className="font-normal">
                                    #{id}
                                </Badge>
                            ))}
                        </div>
                    </HoverCardContent>
                </HoverCard>
            )}
        </div>
    );
}
