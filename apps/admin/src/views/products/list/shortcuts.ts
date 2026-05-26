"use client";

import { useEffect } from "react";

export interface ProductsListShortcutsOptions {
    enabled?: boolean;
    onFocusSearch: () => void;
    onNew: () => void;
    onRefresh: () => void;
    onOpenShortcuts: () => void;
    onClearSelection: () => void;
}

/**
 * Page-level keyboard shortcuts for the products list. Bindings ignore input/textarea targets so
 * the operator can type in the search box without triggering `n` / `r` / `e`. Up/Down + per-row
 * shortcuts (`e`, `q`, `Space`) are owned by the DataTable's own row-focus layer.
 */
export function useProductsListShortcuts({
    enabled = true,
    onFocusSearch,
    onNew,
    onRefresh,
    onOpenShortcuts,
    onClearSelection,
}: ProductsListShortcutsOptions): void {
    useEffect(() => {
        if (!enabled) return;
        const handler = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target !== null) {
                const tag = target.tagName.toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select") return;
                if (target.isContentEditable) return;
            }
            if (event.key === "/") {
                event.preventDefault();
                onFocusSearch();
                return;
            }
            if (event.key === "?") {
                event.preventDefault();
                onOpenShortcuts();
                return;
            }
            if (event.key === "n") {
                event.preventDefault();
                onNew();
                return;
            }
            if (event.key === "r") {
                event.preventDefault();
                onRefresh();
                return;
            }
            if (event.key === "Escape") {
                onClearSelection();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [enabled, onFocusSearch, onNew, onRefresh, onOpenShortcuts, onClearSelection]);
}
