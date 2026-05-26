"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { Checkbox } from "#/components/ui/checkbox";
import { formatNumber } from "#/lib/format";
import { cn } from "#/lib/utils";
import type { CategoryTreeRow } from "#/views/products/categories/types";
import { TREE_INDENT_PX } from "#/views/products/categories/types";

interface TreePickerRowProps {
    row: CategoryTreeRow;
    locale: Locale;
    /**
     * Selection semantics. `multi` renders a checkbox (multi-select pivot). `single` renders a
     * native radio so screen readers announce the group correctly. The product-detail picker
     * uses `multi` for Categories and `single` for Brands.
     */
    selection: "multi" | "single";
    selectionGroupName?: string;
    isChecked: boolean;
    onToggleChecked: (id: number) => void;
    onToggleExpand?: (id: number) => void;
    /** Optional product-count chip beside the label (rendered when `>= 0`). */
    productCount?: number | null;
    /** Optional trailing slot — used by the inline-create surface to drop an inline form below. */
    trailing?: ReactNode;
}

/**
 * Read-only depth-aware row used by the categories / brands sidebar pickers on
 * `/products/{id}`. Trades the full categories-admin row (drag handle + edit/add/delete +
 * descendant + product badges + thumbnail) for the minimum the picker needs: indent + chevron +
 * checkbox-or-radio + label + optional count. Keyboard reachable; the row itself is a button so
 * Enter / Space toggle the selection, and Arrow-Right / Arrow-Left expand / collapse when
 * `onToggleExpand` is provided. RTL flips through `paddingInlineStart` and the chevron flip.
 */
export function TreePickerRow({
    row,
    locale,
    selection,
    selectionGroupName,
    isChecked,
    onToggleChecked,
    onToggleExpand,
    productCount,
    trailing,
}: TreePickerRowProps) {
    const indentPx = row.depth * TREE_INDENT_PX;
    const label = row.category.name[locale] || `#${row.category.id}`;

    const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleChecked(row.category.id);
            return;
        }
        if (onToggleExpand !== undefined && row.hasChildren) {
            if (event.key === "ArrowRight" && !row.isExpanded) {
                event.preventDefault();
                onToggleExpand(row.category.id);
            } else if (event.key === "ArrowLeft" && row.isExpanded) {
                event.preventDefault();
                onToggleExpand(row.category.id);
            }
        }
    };

    return (
        <div>
            <div
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                aria-selected={isChecked}
                tabIndex={0}
                onClick={() => onToggleChecked(row.category.id)}
                onKeyDown={handleRowKeyDown}
                className={cn(
                    "flex h-8 items-center gap-2 rounded-md pe-2 transition-colors",
                    "hover:bg-accent/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isChecked && "bg-primary/10",
                )}
                style={{ paddingInlineStart: `${indentPx + 4}px` }}
            >
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (row.hasChildren && onToggleExpand !== undefined) onToggleExpand(row.category.id);
                    }}
                    aria-hidden={!row.hasChildren}
                    tabIndex={-1}
                    className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
                        "hover:bg-muted/60 hover:text-foreground",
                        row.hasChildren ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    {row.isExpanded ? (
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="size-3.5" data-rtl-flip aria-hidden="true" />
                    )}
                </button>

                {selection === "multi" ? (
                    <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => onToggleChecked(row.category.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={label}
                        className="shrink-0"
                    />
                ) : (
                    <input
                        type="radio"
                        name={selectionGroupName}
                        checked={isChecked}
                        onChange={() => onToggleChecked(row.category.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={label}
                        className="size-3.5 shrink-0 accent-primary"
                    />
                )}

                <span className="min-w-0 flex-1 truncate text-sm">{label}</span>

                {productCount !== undefined && productCount !== null && productCount >= 0 ? (
                    <span className="shrink-0 rounded bg-secondary/60 px-1.5 py-px font-normal text-foreground/70 text-xs tabular-nums">
                        {formatNumber(productCount, locale)}
                    </span>
                ) : null}
            </div>
            {trailing}
        </div>
    );
}
