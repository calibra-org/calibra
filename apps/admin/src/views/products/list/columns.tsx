"use client";

import type { Locale } from "@calibra/shared/i18n";
import { AlertTriangle, ImageOff } from "lucide-react";
import type { useTranslations } from "next-intl";

type TFunction = ReturnType<typeof useTranslations>;

import { type ColumnDef, DataTableColumnHeader, type SortState } from "#/components/data-table";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import { formatDate, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
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
            meta: { headerClassName: "w-10", cellClassName: "w-10" },
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
            size: 36,
        },
        {
            id: "favorite",
            meta: { headerClassName: "w-10", cellClassName: "w-10" },
            header: sortableHeader("favorite", ctx.t("columns.favorite"), "px-0"),
            cell: ({ row }) => <FavoriteToggle productId={row.original.id} initialIsFavorite={ctx.isFavorite(row.original.id)} />,
            enableSorting: true,
            size: 40,
        },
        {
            id: "image",
            meta: { headerClassName: "w-14", cellClassName: "w-14" },
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
            cell: ({ row }) => {
                const product = row.original;
                return (
                    <div className="flex min-w-0 flex-col">
                        <Link
                            href={`/products/${product.id}` as never}
                            className="truncate font-medium text-foreground hover:text-primary hover:underline"
                        >
                            {product.name[ctx.locale] || `#${product.id}`}
                        </Link>
                        <div className="invisible flex items-center gap-3 text-xs opacity-0 transition-opacity group-focus-within/row:visible group-focus-within/row:opacity-100 group-hover/row:visible group-hover/row:opacity-100">
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground hover:underline"
                                onClick={() => ctx.onOpenDetail(product)}
                            >
                                {ctx.t("actions.edit")}
                            </button>
                            <Separator />
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground hover:underline"
                                onClick={() => ctx.onToggleQuickEdit(String(product.id))}
                            >
                                {ctx.t("actions.quickEdit")}
                            </button>
                            <Separator />
                            <Link
                                href={`/product/${product.slug[ctx.locale]}` as never}
                                target="_blank"
                                className="text-muted-foreground hover:text-foreground hover:underline"
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
            cell: ({ row }) => (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        void navigator.clipboard?.writeText(row.original.sku);
                    }}
                    className="font-mono text-muted-foreground text-xs hover:text-foreground"
                    title={ctx.t("copySku")}
                >
                    {row.original.sku || "—"}
                </button>
            ),
            size: 110,
        },
        {
            id: "stock",
            header: sortableHeader("stock", ctx.t("columns.stock")),
            meta: { headerClassName: "text-end", cellClassName: "text-end" },
            cell: ({ row }) => {
                const product = row.original;
                const showLow =
                    product.stockQuantity !== null && product.stockQuantity > 0 && product.stockQuantity <= ctx.lowStockThreshold;
                return (
                    <span className="inline-flex items-center gap-2">
                        {product.stockQuantity !== null && (
                            <span className="font-mono text-muted-foreground text-xs">
                                {formatNumber(product.stockQuantity, ctx.locale)}
                            </span>
                        )}
                        <StatusBadge tone={stockTone[product.stockStatus]}>{ctx.stockT(product.stockStatus)}</StatusBadge>
                        {showLow && (
                            <span title={ctx.t("lowStock")} className="text-amber-500">
                                <AlertTriangle className="size-3.5" aria-hidden="true" />
                            </span>
                        )}
                    </span>
                );
            },
            size: 160,
        },
        {
            id: "price",
            header: sortableHeader("price", ctx.t("columns.price")),
            meta: { headerClassName: "text-end", cellClassName: "text-end" },
            cell: ({ row }) => {
                const product = row.original;
                return (
                    <span className="inline-flex flex-col items-stretch text-end">
                        <span className="font-medium">{formatMoney(product.salePrice ?? product.regularPrice, ctx.locale)}</span>
                        {product.salePrice !== null && (
                            <span className="text-muted-foreground text-xs line-through">
                                {formatMoney(product.regularPrice, ctx.locale)}
                            </span>
                        )}
                    </span>
                );
            },
            size: 140,
        },
        {
            id: "categories",
            header: () => (
                <span className="text-muted-foreground text-xs uppercase tracking-wide">{ctx.t("columns.categories")}</span>
            ),
            cell: ({ row }) => <CategoriesCell ids={row.original.categoryIds} t={ctx.t} />,
            enableSorting: false,
        },
        {
            id: "tags",
            header: () => <span className="text-muted-foreground text-xs uppercase tracking-wide">{ctx.t("columns.tags")}</span>,
            cell: ({ row }) => <CategoriesCell ids={row.original.tagIds} t={ctx.t} />,
            enableSorting: false,
        },
        {
            id: "brand",
            header: () => <span className="text-muted-foreground text-xs uppercase tracking-wide">{ctx.t("columns.brand")}</span>,
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
                    <div className="flex flex-col">
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
            meta: { headerClassName: "text-end", cellClassName: "text-end" },
            cell: () => <span className="text-muted-foreground text-xs">—</span>,
            size: 100,
        },
        {
            id: "actions",
            meta: { headerClassName: "w-12", cellClassName: "w-12 sticky end-0 bg-card" },
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
                                <Badge variant="secondary" className="font-mono text-[10px]">
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
