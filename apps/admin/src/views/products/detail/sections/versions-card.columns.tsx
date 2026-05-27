"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

type TFunction = ReturnType<typeof useTranslations>;

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { type ColumnDef } from "#/components/ui/data-grid";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { MoneyInput } from "#/components/ui/money-input";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { MoreHorizontal, Trash2 } from "#/icons";
import type { VariationView } from "#/lib/products/queries";
import { statusTone, type VersionStatus } from "#/lib/products/versions-format";
import { cn } from "#/lib/utils";

import { VersionTermNames } from "./versions-card.term-lookup";

const STATUS_VALUES: VersionStatus[] = ["draft", "active", "inactive", "archived"];

export interface VersionColumnContext {
    locale: Locale;
    attributesIndex: { id: number; name: string }[];
    onUpdatePrice: (variationId: number, next: number | null) => Promise<void>;
    onUpdateSku: (variationId: number, next: string) => Promise<void>;
    onUpdateStatus: (variationId: number, next: VersionStatus) => Promise<void>;
    onDelete: (variationId: number) => Promise<void>;
    t: TFunction;
}

/**
 * Columns for the Sellable versions data-grid. Sortable headers are intentionally omitted —
 * the variations table is a one-product editor surface, sorting it would just hide the
 * operator's last-chosen order. Inline-editable cells receive the latest values via TanStack's
 * `row.original`; the status cell renders a popover so lifecycle flips in place.
 */
export function buildVersionColumns(ctx: VersionColumnContext): ColumnDef<VariationView>[] {
    const plainHeader = (title: string) => () => <span className="font-medium">{title}</span>;

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
                        onCheckedChange={() => table.toggleAllRowsSelected(!all)}
                        aria-label={ctx.t("selection.selectAll")}
                    />
                );
            },
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={() => row.toggleSelected()}
                    aria-label={ctx.t("selection.selectRow")}
                />
            ),
            enableSorting: false,
            size: 36,
        },
        {
            id: "version",
            header: () => <span className="font-medium">{ctx.t("columns.version")}</span>,
            cell: ({ row }) => (
                <VersionTermNames
                    pins={row.original.pins}
                    attributesIndex={ctx.attributesIndex}
                    fallback={ctx.t("rowSummaryFallback")}
                />
            ),
            enableSorting: false,
            size: 260,
        },
        {
            id: "sku",
            header: plainHeader(ctx.t("columns.sku")),
            cell: ({ row }) => (
                <InlineSkuCell
                    initial={row.original.sku ?? ""}
                    label={ctx.t("columns.sku")}
                    onCommit={(next) => ctx.onUpdateSku(row.original.id, next)}
                />
            ),
            size: 180,
        },
        {
            id: "price",
            header: plainHeader(ctx.t("columns.price")),
            cell: ({ row }) => (
                <MoneyInput
                    valueMinor={row.original.regularPriceMinor}
                    onChangeMinor={(next) => void ctx.onUpdatePrice(row.original.id, next)}
                    min={0}
                    step={1000}
                />
            ),
            size: 200,
        },
        {
            id: "status",
            header: plainHeader(ctx.t("columns.status")),
            cell: ({ row }) => (
                <StatusPopoverCell
                    value={row.original.status}
                    statusLabel={(s) => ctx.t(`status.${s}`)}
                    onChange={(next) => void ctx.onUpdateStatus(row.original.id, next)}
                />
            ),
            size: 130,
        },
        {
            id: "actions",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2" },
            header: () => <span className="sr-only">{ctx.t("columns.actions")}</span>,
            cell: ({ row }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button {...props} type="button" variant="ghost" size="icon" className="size-7">
                                <MoreHorizontal className="size-3.5" aria-hidden="true" />
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void ctx.onUpdateStatus(row.original.id, "archived")}>
                            {ctx.t("rowActions.archive")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-danger focus:text-danger"
                            onClick={() => void ctx.onDelete(row.original.id)}
                        >
                            <Trash2 className="me-2 size-3.5" aria-hidden="true" />
                            {ctx.t("rowActions.delete")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
            enableSorting: false,
            size: 56,
        },
    ];
}

/**
 * Inline SKU input with local-state buffering so each keystroke doesn't fire the mutation —
 * the commit happens on blur when the value actually changed.
 */
function InlineSkuCell({
    initial,
    label,
    onCommit,
}: {
    initial: string;
    label: string;
    onCommit: (next: string) => Promise<void>;
}) {
    const [value, setValue] = useState(initial);
    return (
        <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
                if (value === initial) return;
                void onCommit(value);
            }}
            dir="ltr"
            className="h-8 font-mono text-xs"
            aria-label={label}
        />
    );
}

interface StatusPopoverCellProps {
    value: VersionStatus;
    statusLabel: (status: VersionStatus) => ReactNode;
    onChange: (next: VersionStatus) => void;
}

function StatusPopoverCell({ value, statusLabel, onChange }: StatusPopoverCellProps) {
    const tone = statusTone(value);
    return (
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
                        {statusLabel(value)}
                    </button>
                )}
            />
            <PopoverContent className="w-40 p-1">
                {STATUS_VALUES.map((s) => (
                    <button
                        key={s}
                        type="button"
                        className="block w-full rounded px-2 py-1 text-start text-xs hover:bg-muted"
                        onClick={() => onChange(s)}
                    >
                        {statusLabel(s)}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}
