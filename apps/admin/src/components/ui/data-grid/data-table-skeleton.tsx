"use client";

import { cn } from "#/lib/utils";

interface DataTableSkeletonProps {
    /** Number of skeleton rows to render. Defaults to 8 — roughly one screen on a 20-per-page table. */
    rowCount?: number;
    /** Relative widths so the loading state mirrors the real column widths instead of equal stripes. */
    columnWidths: number[];
    /** Tailwind row-height class — usually `DENSITY_CLASSES[density].row`. */
    rowHeightClass?: string;
}

/** Pulsing skeleton rows shaped like the real layout. Don't use a spinner. */
export function DataTableSkeleton({ rowCount = 8, columnWidths, rowHeightClass = "h-14" }: DataTableSkeletonProps) {
    const total = columnWidths.reduce((acc, n) => acc + n, 0);
    return (
        <div className="divide-y divide-border">
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: deterministic skeleton order
                <div key={rowIndex} className={cn("flex items-center gap-4 px-4", rowHeightClass)}>
                    {columnWidths.map((width, columnIndex) => (
                        <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: deterministic skeleton order
                            key={columnIndex}
                            className="h-3 animate-pulse rounded bg-muted"
                            style={{ width: `${(width / total) * 100}%` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
