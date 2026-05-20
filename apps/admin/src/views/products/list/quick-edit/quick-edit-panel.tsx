"use client";

import type { AdminProduct } from "#/lib/types";

import { QuickEditForm } from "./quick-edit-form";

interface QuickEditPanelProps {
    product: AdminProduct;
    onClose: () => void;
}

/** Wrapper for the {@link QuickEditForm} so the inline row sub-component stays presentational. */
export function QuickEditPanel({ product, onClose }: QuickEditPanelProps) {
    return (
        <div className="border-primary/20 border-y bg-muted/30">
            <QuickEditForm product={product} onClose={onClose} />
        </div>
    );
}
