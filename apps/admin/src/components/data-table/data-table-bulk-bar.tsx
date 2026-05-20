"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "#/lib/utils";

interface DataTableBulkBarProps {
    children: React.ReactNode;
    selectedCount: number;
    onClear: () => void;
    label: (count: number) => string;
    clearLabel: string;
}

/**
 * Floating action bar at the bottom-center of the viewport. Stays out of layout flow so the
 * table body never reshuffles when a row gets selected. Esc clears the selection. The container
 * uses logical centering (`start-1/2`) so it remains centered under RTL.
 */
export function DataTableBulkBar({ children, selectedCount, onClear, label, clearLabel }: DataTableBulkBarProps) {
    useEffect(() => {
        if (selectedCount === 0) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClear();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedCount, onClear]);

    if (selectedCount === 0) return null;

    return (
        <div
            className={cn(
                "pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4",
                "transition-transform duration-200",
            )}
        >
            <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full bg-foreground px-3 py-1.5 text-background shadow-lg">
                <span className="whitespace-nowrap px-2 font-medium text-sm">{label(selectedCount)}</span>
                <span className="h-5 w-px bg-background/20" aria-hidden="true" />
                <div className="flex items-center gap-1">{children}</div>
                <span className="h-5 w-px bg-background/20" aria-hidden="true" />
                <button
                    type="button"
                    onClick={onClear}
                    className="grid size-7 place-items-center rounded-full text-background/80 outline-none hover:bg-background/10 hover:text-background focus-visible:ring-2 focus-visible:ring-background/40"
                    aria-label={clearLabel}
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
