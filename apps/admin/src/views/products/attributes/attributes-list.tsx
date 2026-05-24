"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Search, Settings2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { BulkSelectionBar } from "#/components/ui/bulk-selection-bar";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminAttribute } from "#/lib/types";
import { cn } from "#/lib/utils";

import type { AttributeSortKey } from "./attributes-view";

interface AttributesListProps {
    rows: AdminAttribute[];
    visibleRows: AdminAttribute[];
    termPreviews: Record<number, string[]>;
    selectedId: number | null;
    selectedIds: Set<number>;
    search: string;
    sortKey: AttributeSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
    onSearchChange: (value: string) => void;
    onSort: (key: AttributeSortKey) => void;
    onSelectRow: (id: number) => void;
    onToggleSelected: (id: number) => void;
    onToggleAllSelected: () => void;
    onClearSelected: () => void;
    onBulkDelete: () => void;
    onEdit: (id: number) => void;
    onDelete: (id: number) => void;
}

/**
 * Attributes list. Flat list with sortable columns (name / slug / term count) and three
 * row-hover actions: Configure terms (primary — navigates to the per-attribute terms page),
 * Edit, Delete. Bulk-select via the leading checkbox column.
 */
export function AttributesList({
    rows,
    visibleRows,
    termPreviews,
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
}: AttributesListProps) {
    const t = useTranslations("Attributes");
    const tToolbar = useTranslations("Attributes.toolbar");
    const tTable = useTranslations("Attributes.table");
    const tOrderBy = useTranslations("Attributes.orderBy");
    const tBulk = useTranslations("Attributes.bulk");
    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <Toolbar search={search} onSearchChange={onSearchChange} />

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
                <EmptyList hasSearch={search.length > 0} totalAttributes={rows.length} />
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
                                <th className="px-3 py-2 text-start font-medium">{tTable("orderBy")}</th>
                                <th className="px-3 py-2 text-start font-medium">{tTable("termsPreview")}</th>
                                <SortHeader
                                    label={tTable("termCount")}
                                    active={sortKey === "termCount"}
                                    direction={sortDir}
                                    onClick={() => onSort("termCount")}
                                    className="text-end"
                                />
                                <th className="w-40 px-3 py-2 text-end font-medium">{tTable("actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const isSelected = selectedIds.has(row.id);
                                const isActive = selectedId === row.id;
                                const preview = termPreviews[row.id] ?? [];
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
                                                {row.code}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="text-muted-foreground text-xs">{tOrderBy(row.orderBy)}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <TermsPreview
                                                names={preview}
                                                total={row.termCount}
                                                attributeId={row.id}
                                                attributeName={row.name[locale] || tTable("untitled")}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-end">
                                            <TermCountPill count={row.termCount} locale={locale} />
                                        </td>
                                        <td className="w-40 px-3 py-2 text-end">
                                            <div
                                                className={cn(
                                                    "inline-flex items-center gap-1 opacity-0 transition-opacity",
                                                    "group-focus-within:opacity-100 group-hover:opacity-100",
                                                    isActive && "opacity-100",
                                                )}
                                            >
                                                <Button
                                                    asChild
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={tTable("termsAria", {
                                                        name: row.name[locale] || tTable("untitled"),
                                                    })}
                                                    className="size-8 text-muted-foreground hover:text-foreground"
                                                >
                                                    {/* biome-ignore lint/suspicious/noExplicitAny: Link href is locale-aware */}
                                                    <Link href={`/products/attributes/${row.id}` as any}>
                                                        <Settings2 className="size-3.5" aria-hidden="true" />
                                                    </Link>
                                                </Button>
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
}

function Toolbar({ search, onSearchChange }: ToolbarProps) {
    const t = useTranslations("Attributes.toolbar");
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

interface TermsPreviewProps {
    names: string[];
    total: number;
    attributeId: number;
    attributeName: string;
}

function TermsPreview({ names, total, attributeId, attributeName }: TermsPreviewProps) {
    const t = useTranslations("Attributes.table");
    if (total === 0) {
        return (
            // biome-ignore lint/suspicious/noExplicitAny: Link href is locale-aware
            <Link href={`/products/attributes/${attributeId}` as any} className="text-primary text-xs hover:underline">
                {t("termsConfigureFor", { name: attributeName })}
            </Link>
        );
    }
    const overflow = total - names.length;
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs">
            {names.map((name) => (
                <span
                    key={`${attributeId}-term-${name}`}
                    className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-foreground"
                >
                    {name}
                </span>
            ))}
            {overflow > 0 && <span className="text-muted-foreground">{t("termsPreviewMore", { count: overflow })}</span>}
            {/* biome-ignore lint/suspicious/noExplicitAny: Link href is locale-aware */}
            <Link href={`/products/attributes/${attributeId}` as any} className="text-primary hover:underline">
                ({t("termsConfigure")})
            </Link>
        </div>
    );
}

interface TermCountPillProps {
    count: number;
    locale: Locale;
}

function TermCountPill({ count, locale }: TermCountPillProps) {
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
    t: ReturnType<typeof useTranslations<"Attributes">>;
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
    totalAttributes: number;
}

function EmptyList({ hasSearch, totalAttributes }: EmptyListProps): ReactNode {
    const t = useTranslations("Attributes.emptyList");
    if (totalAttributes === 0 && !hasSearch) {
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
