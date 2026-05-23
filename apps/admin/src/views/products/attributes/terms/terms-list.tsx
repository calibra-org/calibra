"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Search, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { formatNumber } from "#/lib/format";
import type { AdminAttributeTerm } from "#/lib/types";
import { cn } from "#/lib/utils";

import type { TermSortKey } from "./attribute-terms-view";

interface TermsListProps {
    rows: AdminAttributeTerm[];
    visibleRows: AdminAttributeTerm[];
    selectedId: number | null;
    selectedIds: Set<number>;
    search: string;
    sortKey: TermSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
    onSearchChange: (value: string) => void;
    onSort: (key: TermSortKey) => void;
    onSelectRow: (id: number) => void;
    onToggleSelected: (id: number) => void;
    onToggleAllSelected: () => void;
    onClearSelected: () => void;
    onBulkDelete: () => void;
    onEdit: (id: number) => void;
    onDelete: (id: number) => void;
}

/** Terms list — same shape as Tags. Flat, sortable, hover-only row actions, bulk delete. */
export function TermsList({
    rows,
    visibleRows,
    selectedId,
    selectedIds,
    search,
    sortKey,
    sortDir,
    locale,
    onSearchChange,
    onSort,
    onSelectRow,
    onToggleSelected,
    onToggleAllSelected,
    onClearSelected,
    onBulkDelete,
    onEdit,
    onDelete,
}: TermsListProps) {
    const t = useTranslations("AttributeTerms");
    const tToolbar = useTranslations("AttributeTerms.toolbar");
    const tTable = useTranslations("AttributeTerms.table");
    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));
    const hasSelection = selectedIds.size > 0;

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search
                        className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={tToolbar("searchPlaceholder")}
                        className="h-9 ps-9"
                    />
                    {search.length > 0 && (
                        <button
                            type="button"
                            aria-label={tToolbar("clearSearch")}
                            onClick={() => onSearchChange("")}
                            className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-3.5" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {hasSelection && (
                <BulkBar count={selectedIds.size} locale={locale} onClear={onClearSelected} onBulkDelete={onBulkDelete} />
            )}

            {visibleRows.length === 0 ? (
                <EmptyList hasSearch={search.length > 0} totalTerms={rows.length} />
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
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                dir="ltr"
                                                className="block max-w-full truncate font-mono text-muted-foreground text-xs"
                                            >
                                                {row.slug}
                                            </span>
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

interface BulkBarProps {
    count: number;
    locale: Locale;
    onClear: () => void;
    onBulkDelete: () => void;
}

function BulkBar({ count, locale, onClear, onBulkDelete }: BulkBarProps) {
    const t = useTranslations("AttributeTerms.bulk");
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <div className="inline-flex items-center gap-2 text-foreground">
                <Badge className="bg-primary px-2 font-medium text-primary-foreground tabular-nums">
                    {formatNumber(count, locale)}
                </Badge>
                <span>{t("selected", { count })}</span>
            </div>
            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="h-8 gap-1 px-2 text-muted-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                    {t("clear")}
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={onBulkDelete} className="h-8 gap-1.5 px-3">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("delete")}
                </Button>
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

interface FooterCountProps {
    visible: number;
    total: number;
    locale: Locale;
    t: ReturnType<typeof useTranslations<"AttributeTerms">>;
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
    totalTerms: number;
}

function EmptyList({ hasSearch, totalTerms }: EmptyListProps): ReactNode {
    const t = useTranslations("AttributeTerms.emptyList");
    if (totalTerms === 0 && !hasSearch) {
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
