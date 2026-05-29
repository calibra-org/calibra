"use client";

import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

interface DataTableSkeletonProps {
    /** Number of skeleton rows to render. Defaults to 8 — roughly one screen on a 20-per-page table. */
    rowCount?: number;
    /** Relative widths so the loading state mirrors the real column widths instead of equal stripes. */
    columnWidths: number[];
    /** Tailwind row-height class — usually `DENSITY_CLASSES[density].row`. */
    rowHeightClass?: string;
}

/** Shimmer skeleton rows shaped like the real columns. Don't use a spinner. */
export function DataTableSkeleton({ rowCount = 8, columnWidths, rowHeightClass = "h-14" }: DataTableSkeletonProps) {
    const total = columnWidths.reduce((acc, n) => acc + n, 0) || 1;
    return (
        <div className="divide-y divide-border">
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: deterministic skeleton order
                <div key={rowIndex} className={cn("flex items-center gap-4 px-4", rowHeightClass)}>
                    {columnWidths.map((width, columnIndex) => (
                        <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: deterministic skeleton order
                            key={columnIndex}
                            className="flex"
                            style={{ width: `${(width / total) * 100}%` }}
                        >
                            <Skeleton className="h-3.5 w-full" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
