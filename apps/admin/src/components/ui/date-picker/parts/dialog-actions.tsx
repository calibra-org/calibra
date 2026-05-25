"use client";

import { Button } from "#/components/ui/button";

interface DialogActionsProps {
    onCancel: () => void;
    onApply: () => void;
    canApply: boolean;
    labels: { cancel: string; apply: string };
}

/**
 * Bottom-of-dialog action bar. Apply is enabled only when the user typed into the input —
 * direct grid clicks commit instantly per the picker's instant-commit contract, so the button
 * exists purely as a safety valve for typed input.
 */
export function DialogActions({ onCancel, onApply, canApply, labels }: DialogActionsProps) {
    return (
        <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                {labels.cancel}
            </Button>
            <Button type="button" size="sm" onClick={onApply} disabled={!canApply}>
                {labels.apply}
            </Button>
        </div>
    );
}
