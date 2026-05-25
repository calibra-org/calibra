"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";

import { Dialog, DialogContent, DialogTrigger } from "#/components/ui/dialog";

import { DatePickerBody } from "./date-picker-body";
import type { DateFilterValue } from "./types";
import { useDateFilter, type UseDateFilterOptions } from "./use-date-filter";

interface DatePickerDialogProps extends Omit<UseDateFilterOptions, "onChange" | "onSubmit"> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (next: DateFilterValue | null) => void;
    /** Optional custom trigger; usually the chip's value segment supplies its own button. */
    children?: ReactNode;
}

/**
 * Modal dialog wrapper around {@link DatePickerBody}. Closes itself on commit (instant-commit
 * grid clicks land in onChange, which closes the dialog) and on cancel.
 */
export function DatePickerDialog({ open, onOpenChange, children, onChange, ...rest }: DatePickerDialogProps) {
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

    /** Reset staged input every time the dialog re-opens so prior typing doesn't bleed in. */
    useEffect(() => {
        if (!open) return;
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {children !== undefined && <DialogTrigger render={<div />}>{children}</DialogTrigger>}
            <DialogContent className="max-w-xl gap-3 p-4">
                <DatePickerBody state={state} fieldLabel={rest.fieldLabel} />
            </DialogContent>
        </Dialog>
    );
}
