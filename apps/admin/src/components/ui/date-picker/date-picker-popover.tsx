"use client";

import { type ReactNode, useCallback, useRef } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

import { DatePickerBody } from "./date-picker-body";
import type { DateFilterValue } from "./types";
import { useDateFilter, type UseDateFilterOptions } from "./use-date-filter";

interface DatePickerPopoverProps extends Omit<UseDateFilterOptions, "onChange" | "onSubmit"> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (next: DateFilterValue | null) => void;
    trigger: ReactNode;
}

/**
 * Non-modal popover wrapper around {@link DatePickerBody}. Mounted by form-mode wrappers
 * ({@link DateField}, {@link DateRangeField}) where the picker should anchor to the input rather
 * than dim the whole screen.
 */
export function DatePickerPopover({
    open,
    onOpenChange,
    trigger,
    onChange,
    ...rest
}: DatePickerPopoverProps) {
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
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger render={<div />}>{trigger}</PopoverTrigger>
            <PopoverContent className="w-[28rem] p-3">
                <DatePickerBody state={state} fieldLabel={rest.fieldLabel} />
            </PopoverContent>
        </Popover>
    );
}
