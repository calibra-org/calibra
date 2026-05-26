"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from "#/lib/format";
import { cn } from "#/lib/utils";

/**
 * `DataGrid.Cell.*` family — preset cell renderers that wrap `#/lib/format` so columns.tsx files
 * stop reinventing the formatter boilerplate. Each cell normalises `null` / `undefined` to a
 * thin em-dash so empty cells read as "not provided" instead of disappearing into row whitespace.
 *
 * Usage:
 *
 *   cell: ({ row }) => <DataGridCellMoney value={row.original.totalMinor} locale={locale} />,
 *   cell: ({ row }) => <DataGridCellDate value={row.original.createdAt} locale={locale} />,
 *   cell: ({ row }) => <DataGridCellStatus tone="success">{t("status.published")}</DataGridCellStatus>,
 *
 * (Exported individually so consumers can keep the import surface flat; the `DataGrid.Cell.*`
 * namespace shape lands as a follow-up once the data-grid root component re-exports them.)
 */

const EMDASH = "—";

export interface DataGridCellTextProps {
    value: string | null | undefined;
    truncate?: boolean;
    className?: string;
}

export function DataGridCellText({ value, truncate = true, className }: DataGridCellTextProps) {
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{EMDASH}</span>;
    return <span className={cn(truncate && "block truncate", className)}>{value}</span>;
}
DataGridCellText.displayName = "DataGridCellText";

export interface DataGridCellMoneyProps {
    value: number | null | undefined;
    locale: Locale;
    display?: "IRT" | "IRR";
    withSymbol?: boolean;
    className?: string;
}

export function DataGridCellMoney({ value, locale, display, withSymbol, className }: DataGridCellMoneyProps) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{EMDASH}</span>;
    return <span className={cn("tabular-nums", className)}>{formatMoney(value, locale, { display, withSymbol })}</span>;
}
DataGridCellMoney.displayName = "DataGridCellMoney";

export interface DataGridCellDateProps {
    value: Date | string | null | undefined;
    locale: Locale;
    className?: string;
}

export function DataGridCellDate({ value, locale, className }: DataGridCellDateProps) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{EMDASH}</span>;
    const iso = value instanceof Date ? value.toISOString() : value;
    return <span className={cn("tabular-nums", className)}>{formatDate(iso, locale)}</span>;
}
DataGridCellDate.displayName = "DataGridCellDate";

export interface DataGridCellDateTimeProps {
    value: Date | string | null | undefined;
    locale: Locale;
    className?: string;
}

export function DataGridCellDateTime({ value, locale, className }: DataGridCellDateTimeProps) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{EMDASH}</span>;
    const iso = value instanceof Date ? value.toISOString() : value;
    return <span className={cn("tabular-nums", className)}>{formatDateTime(iso, locale)}</span>;
}
DataGridCellDateTime.displayName = "DataGridCellDateTime";

export interface DataGridCellNumberProps {
    value: number | null | undefined;
    locale: Locale;
    className?: string;
}

export function DataGridCellNumber({ value, locale, className }: DataGridCellNumberProps) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{EMDASH}</span>;
    return <span className={cn("tabular-nums", className)}>{formatNumber(value, locale)}</span>;
}
DataGridCellNumber.displayName = "DataGridCellNumber";

export interface DataGridCellPercentProps {
    value: number | null | undefined;
    locale: Locale;
    fractionDigits?: number;
    className?: string;
}

export function DataGridCellPercent({ value, locale, fractionDigits, className }: DataGridCellPercentProps) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{EMDASH}</span>;
    return <span className={cn("tabular-nums", className)}>{formatPercent(value, locale, fractionDigits)}</span>;
}
DataGridCellPercent.displayName = "DataGridCellPercent";

export interface DataGridCellStatusProps {
    tone: "default" | "info" | "success" | "warning" | "danger";
    children: ReactNode;
    className?: string;
}

export function DataGridCellStatus({ tone, children, className }: DataGridCellStatusProps) {
    return (
        <Badge variant="secondary" tone={tone} dot className={className}>
            {children}
        </Badge>
    );
}
DataGridCellStatus.displayName = "DataGridCellStatus";

export interface DataGridCellImageProps {
    src: string | null | undefined;
    alt?: string;
    size?: 6 | 8 | 10 | 12;
    fallback?: ReactNode;
    className?: string;
}

export function DataGridCellImage({ src, alt = "", size = 8, fallback, className }: DataGridCellImageProps) {
    const sizeClass = size === 6 ? "size-6" : size === 8 ? "size-8" : size === 10 ? "size-10" : "size-12";
    if (src === null || src === undefined || src === "") {
        return (
            <span
                className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground",
                    sizeClass,
                    className,
                )}
            >
                {fallback}
            </span>
        );
    }
    return (
        // biome-ignore lint/performance/noImgElement: lazy-loaded thumbnail of an arbitrary URL
        <img
            src={src}
            alt={alt}
            loading="lazy"
            className={cn("shrink-0 rounded border border-border bg-muted object-cover", sizeClass, className)}
        />
    );
}
DataGridCellImage.displayName = "DataGridCellImage";
