"use client";

import { useCallback, useRef } from "react";

import { Dialog, DialogContent } from "#/components/ui/dialog";

import { DatePickerBody } from "./date-picker-body";
import { type UseDateFilterOptions, useDateFilter } from "./use-date-filter";
import type { DateFilterValue } from "./types";

interface DatePickerDialogProps extends Omit<UseDateFilterOptions, "onChange" | "onSubmit"> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (next: DateFilterValue | null) => void;
}

/**
 * Modal dialog wrapper around {@link DatePickerBody}. Open / close is fully controlled by the
 * caller (the filter chip owns the trigger button), so the dialog mounts without a Base UI
 * Trigger — the X close affordance is suppressed too because the dialog body has its own
 * cancel/apply bar.
 */
export function DatePickerDialog({ open, onOpenChange, onChange, ...rest }: DatePickerDialogProps) {
    const closeRef = useRef<() => void>(() => {});
    closeRef.current = () => onOpenChange(false);

    const handleChange = useCallback(
        (next: DateFilterValue | null) => {
            onChange(next);
            closeRef.current();
        },
        [onChange],
    );

    const state = useDateFilter({
        ...rest,
        onChange: handleChange,
        onCancel: () => closeRef.current(),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl gap-3 p-4" hideClose>
                <DatePickerBody state={state} fieldLabel={rest.fieldLabel} />
            </DialogContent>
        </Dialog>
    );
}
