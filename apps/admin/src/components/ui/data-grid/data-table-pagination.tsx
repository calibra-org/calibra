"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "#/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";

import type { PaginationMeta } from "./types";

interface DataTablePaginationProps {
    meta: PaginationMeta;
    limitOptions: readonly number[];
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
    /** Optional selection count rendered on the start side. */
    selectedCount?: number;
    labels: {
        rowsPerPage: string;
        showing: (from: number, to: number, total: number) => string;
        selectedOf: (selected: number, total: number) => string;
        first: string;
        previous: string;
        next: string;
        last: string;
        pageOf: (page: number, lastPage: number) => string;
    };
    /**
     * Format a number the way the active locale wants it (e.g. Persian digits in `fa`). Passed
     * in so the abstraction stays locale-agnostic.
     */
    formatNumber: (value: number) => string;
}

/**
 * Pagination footer rendered below the table body. Chevron icons are directional — the
 * {@link PaginationIconButton} carries `data-rtl-flip` so a single icon set serves both writing
 * systems (the matching CSS rule lives in `styles/globals.css`).
 */
export function DataTablePagination({
    meta,
    limitOptions,
    onPageChange,
    onLimitChange,
    selectedCount,
    labels,
    formatNumber,
}: DataTablePaginationProps) {
    const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    const canPrev = meta.page > 1;
    const canNext = meta.page < meta.lastPage;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-border border-t bg-card/40 px-4 py-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-3">
                {selectedCount !== undefined && selectedCount > 0 ? (
                    <span className="font-medium text-foreground">{labels.selectedOf(selectedCount, meta.total)}</span>
                ) : (
                    <span>{labels.showing(from, to, meta.total)}</span>
                )}
                <div className="flex items-center gap-2">
                    <span>{labels.rowsPerPage}</span>
                    <Select value={String(meta.limit)} onValueChange={(value) => onLimitChange(Number(value))}>
                        <SelectTrigger className="h-7 w-[5rem] gap-1 px-2 text-xs">
                            <SelectValue>{formatNumber(meta.limit)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {limitOptions.map((option) => (
                                <SelectItem key={option} value={String(option)}>
                                    {formatNumber(option)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="flex items-center gap-1">
                <span className="me-2 font-medium text-foreground">{labels.pageOf(meta.page, meta.lastPage)}</span>
                <PaginationIconButton disabled={!canPrev} onClick={() => onPageChange(1)} ariaLabel={labels.first}>
                    <ChevronsLeft className="size-4" />
                </PaginationIconButton>
                <PaginationIconButton disabled={!canPrev} onClick={() => onPageChange(meta.page - 1)} ariaLabel={labels.previous}>
                    <ChevronLeft className="size-4" />
                </PaginationIconButton>
                <PaginationIconButton disabled={!canNext} onClick={() => onPageChange(meta.page + 1)} ariaLabel={labels.next}>
                    <ChevronRight className="size-4" />
                </PaginationIconButton>
                <PaginationIconButton disabled={!canNext} onClick={() => onPageChange(meta.lastPage)} ariaLabel={labels.last}>
                    <ChevronsRight className="size-4" />
                </PaginationIconButton>
            </div>
        </div>
    );
}

function PaginationIconButton({
    children,
    onClick,
    disabled,
    ariaLabel,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    ariaLabel: string;
}) {
    return (
        <Button
            variant="ghost"
            size="icon"
            data-rtl-flip
            className={cn("size-7")}
            disabled={disabled}
            onClick={onClick}
            aria-label={ariaLabel}
        >
            {children}
        </Button>
    );
}
