"use client";

import { type ComponentProps, type ReactElement, useCallback, useRef } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

import { DatePickerBody } from "./date-picker-body";
import { type UseDateFilterOptions, useDateFilter } from "./use-date-filter";
import type { DateFilterValue } from "./types";

interface DatePickerPopoverProps extends Omit<UseDateFilterOptions, "onChange" | "onSubmit"> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (next: DateFilterValue | null) => void;
    /**
     * Render-prop for the popover trigger — Base UI's `Popover.Trigger` requires a real `<button>`
     * to keep proper semantics. The function receives the trigger props and must spread them onto
     * a native `<button>`.
     */
    renderTrigger: (props: ComponentProps<"button">) => ReactElement;
}

/**
 * Non-modal popover wrapper around {@link DatePickerBody}. Mounted by form-mode wrappers
 * ({@link DateField}, {@link DateRangeField}) where the picker should anchor to the input rather
 * than dim the whole screen.
 */
export function DatePickerPopover({ open, onOpenChange, renderTrigger, onChange, ...rest }: DatePickerPopoverProps) {
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
            <PopoverTrigger render={(props) => renderTrigger(props as ComponentProps<"button">)} />
            <PopoverContent className="w-[28rem] p-3">
                <DatePickerBody state={state} fieldLabel={rest.fieldLabel} />
            </PopoverContent>
        </Popover>
    );
}
