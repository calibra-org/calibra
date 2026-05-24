"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageIcon, Pencil, Search, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { BulkSelectionBar } from "#/components/ui/bulk-selection-bar";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { formatNumber } from "#/lib/format";
import type { AdminBrand } from "#/lib/types";
import { cn } from "#/lib/utils";

import type { BrandFilterMode, BrandSortKey, BrandsStats } from "./brands-view";

interface BrandsListProps {
    rows: AdminBrand[];
    visibleRows: AdminBrand[];
    selectedId: number | null;
    selectedIds: Set<number>;
    search: string;
    filter: BrandFilterMode;
    sortKey: BrandSortKey;
    sortDir: "asc" | "desc";
    stats: BrandsStats;
    locale: Locale;
    onSearchChange: (value: string) => void;
    onFilterChange: (value: BrandFilterMode) => void;
    onSort: (key: BrandSortKey) => void;
    onSelectRow: (id: number) => void;
    onToggleSelected: (id: number) => void;
    onToggleAllSelected: () => void;
    onClearSelected: () => void;
    onBulkDelete: () => void;
    onEdit: (id: number) => void;
    onDelete: (id: number) => void;
}

/**
 * The list pane. Mirrors the Tags list — toolbar (search + filter pills) + sortable table
 * with bulk-select checkboxes and hover-only row actions. Each row carries a logo thumbnail
 * (or a placeholder when none is set).
 */
export function BrandsList({
    rows,
    visibleRows,
    selectedId,
    selectedIds,
    search,
    filter,
    sortKey,
    sortDir,
    stats,
    locale,
    onSearchChange,
    onFilterChange,
    onSort,
    onSelectRow,
    onToggleSelected,
    onToggleAllSelected,
    onClearSelected,
    onBulkDelete,
    onEdit,
    onDelete,
}: BrandsListProps) {
    const t = useTranslations("Brands");
    const tToolbar = useTranslations("Brands.toolbar");
    const tTable = useTranslations("Brands.table");
    const tBulk = useTranslations("Brands.bulk");
    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));

    const filters: { key: BrandFilterMode; label: string; count: number }[] = [
        { key: "all", label: tToolbar("filters.all"), count: stats.total },
        { key: "withProducts", label: tToolbar("filters.withProducts"), count: stats.withProducts },
        { key: "empty", label: tToolbar("filters.empty"), count: stats.empty },
    ];

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <Toolbar
                search={search}
                onSearchChange={onSearchChange}
                filter={filter}
                onFilterChange={onFilterChange}
                filters={filters}
                locale={locale}
            />

            <BulkSelectionBar
                count={selectedIds.size}
                locale={locale}
                labels={{
                    selected: tBulk("selected", { count: selectedIds.size }),
                    cancel: tBulk("clear"),
                    delete: tBulk("delete"),
                }}
                onCancel={onClearSelected}
                onDelete={onBulkDelete}
            />

            {visibleRows.length === 0 ? (
                <EmptyList hasSearch={search.length > 0 || filter !== "all"} totalBrands={rows.length} />
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border/60 border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                                <th className="w-10 px-3 py-2">
                                    <Checkbox
                                        aria-label={tToolbar("selectAll")}
                                        checked={allVisibleSelected}
                                        onCheckedChange={onToggleAllSelected}
                                    />
                                </th>
                                <SortHeader
                                    label={tTable("name")}
                                    active={sortKey === "name"}
                                    direction={sortDir}
                                    onClick={() => onSort("name")}
                                />
                                <SortHeader
                                    label={tTable("slug")}
                                    active={sortKey === "slug"}
                                    direction={sortDir}
                                    onClick={() => onSort("slug")}
                                />
                                <SortHeader
                                    label={tTable("productCount")}
                                    active={sortKey === "productCount"}
                                    direction={sortDir}
                                    onClick={() => onSort("productCount")}
                                    className="text-end"
                                />
                                <th className="w-32 px-3 py-2 text-end font-medium">{tTable("actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const isSelected = selectedIds.has(row.id);
                                const isActive = selectedId === row.id;
                                return (
                                    <tr
                                        key={row.id}
                                        className={cn(
                                            "group border-border/40 border-b transition-colors last:border-b-0",
                                            isActive ? "bg-primary/5" : "hover:bg-muted/40",
                                            isSelected && "bg-primary/10",
                                        )}
                                    >
                                        <td className="w-10 px-3 py-2">
                                            <Checkbox
                                                aria-label={tToolbar("selectRow", {
                                                    name: row.name[locale] || tTable("untitled"),
                                                })}
                                                checked={isSelected}
                                                onCheckedChange={() => onToggleSelected(row.id)}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <BrandLogo url={row.logoUrl} alt={row.name[locale] ?? ""} />
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectRow(row.id)}
                                                    className={cn(
                                                        "block max-w-full truncate text-start font-medium",
                                                        isActive ? "text-primary" : "text-foreground hover:text-primary",
                                                    )}
                                                >
                                                    {row.name[locale] || tTable("untitled")}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                dir="ltr"
                                                className="block max-w-full truncate font-mono text-muted-foreground text-xs"
                                            >
                                                {row.slug[locale]}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-end">
                                            <ProductCountPill count={row.productCount} locale={locale} />
                                        </td>
                                        <td className="w-32 px-3 py-2 text-end">
                                            <div
                                                className={cn(
                                                    "inline-flex items-center gap-1 opacity-0 transition-opacity",
                                                    "group-focus-within:opacity-100 group-hover:opacity-100",
                                                    isActive && "opacity-100",
                                                )}
                                            >
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={tTable("editAria", {
                                                        name: row.name[locale] || tTable("untitled"),
                                                    })}
                                                    onClick={() => onEdit(row.id)}
                                                    className="size-8 text-muted-foreground hover:text-foreground"
                                                >
                                                    <Pencil className="size-3.5" aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={tTable("deleteAria", {
                                                        name: row.name[locale] || tTable("untitled"),
                                                    })}
                                                    onClick={() => onDelete(row.id)}
                                                    className="size-8 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="size-3.5" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <FooterCount visible={visibleRows.length} total={rows.length} locale={locale} t={t} />
        </div>
    );
}

interface ToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    filter: BrandFilterMode;
    onFilterChange: (value: BrandFilterMode) => void;
    filters: { key: BrandFilterMode; label: string; count: number }[];
    locale: Locale;
}

function Toolbar({ search, onSearchChange, filter, onFilterChange, filters, locale }: ToolbarProps) {
    const t = useTranslations("Brands.toolbar");
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-9 ps-9"
                />
                {search.length > 0 && (
                    <button
                        type="button"
                        aria-label={t("clearSearch")}
                        onClick={() => onSearchChange("")}
                        className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {filters.map((entry) => {
                    const active = filter === entry.key;
                    return (
                        <button
                            key={entry.key}
                            type="button"
                            onClick={() => onFilterChange(entry.key)}
                            className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium text-xs transition-colors",
                                active
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                            aria-pressed={active}
                        >
                            <span>{entry.label}</span>
                            <Badge
                                variant="secondary"
                                className={cn(
                                    "h-4 min-w-5 justify-center bg-secondary/70 px-1 font-normal text-[10px] tabular-nums",
                                    active && "bg-primary/15 text-primary",
                                )}
                            >
                                {formatNumber(entry.count, locale)}
                            </Badge>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface SortHeaderProps {
    label: string;
    active: boolean;
    direction: "asc" | "desc";
    onClick: () => void;
    className?: string;
}

function SortHeader({ label, active, direction, onClick, className }: SortHeaderProps) {
    const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
        <th className={cn("px-3 py-2 text-start font-medium", className)}>
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "inline-flex items-center gap-1 hover:text-foreground",
                    active ? "text-foreground" : "text-muted-foreground",
                    className?.includes("text-end") && "flex-row-reverse",
                )}
            >
                <span>{label}</span>
                <Icon className="size-3" aria-hidden="true" />
            </button>
        </th>
    );
}

interface BrandLogoProps {
    url: string | null;
    alt: string;
}

function BrandLogo({ url, alt }: BrandLogoProps) {
    if (url === null || url.length === 0) {
        return (
            <div
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/60"
                aria-hidden="true"
            >
                <ImageIcon className="size-3.5" />
            </div>
        );
    }
    return (
        // biome-ignore lint/performance/noImgElement: mock CDN, no Next/Image loader configured
        <img src={url} alt={alt} loading="lazy" className="size-8 shrink-0 rounded-md border border-border/40 object-cover" />
    );
}

interface ProductCountPillProps {
    count: number;
    locale: Locale;
}

function ProductCountPill({ count, locale }: ProductCountPillProps) {
    if (count === 0) {
        return (
            <span className="inline-flex h-6 min-w-9 items-center justify-center rounded-full border border-border/60 bg-muted/40 px-2 text-[11px] text-muted-foreground tabular-nums">
                {formatNumber(0, locale)}
            </span>
        );
    }
    return (
        <span className="inline-flex h-6 min-w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-2 font-medium text-[11px] text-primary tabular-nums">
            {formatNumber(count, locale)}
        </span>
    );
}

interface FooterCountProps {
    visible: number;
    total: number;
    locale: Locale;
    t: ReturnType<typeof useTranslations<"Brands">>;
}

function FooterCount({ visible, total, locale, t }: FooterCountProps) {
    if (total === 0) return null;
    if (visible === total) {
        return <p className="text-muted-foreground text-xs">{t("footerCount.total", { total: formatNumber(total, locale) })}</p>;
    }
    return (
        <p className="text-muted-foreground text-xs">
            {t("footerCount.partial", {
                visible: formatNumber(visible, locale),
                total: formatNumber(total, locale),
            })}
        </p>
    );
}

interface EmptyListProps {
    hasSearch: boolean;
    totalBrands: number;
}

function EmptyList({ hasSearch, totalBrands }: EmptyListProps): ReactNode {
    const t = useTranslations("Brands.emptyList");
    if (totalBrands === 0 && !hasSearch) {
        return (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-12 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <Search className="size-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                    <h3 className="font-medium text-foreground">{t("empty.title")}</h3>
                    <p className="max-w-sm text-muted-foreground text-sm">{t("empty.description")}</p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-12 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Search className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
                <h3 className="font-medium text-foreground">{t("noResults.title")}</h3>
                <p className="max-w-sm text-muted-foreground text-sm">{t("noResults.description")}</p>
            </div>
        </div>
    );
}
