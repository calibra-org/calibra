"use client";

import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { cn } from "@calibra/shared";
import type { ReactNode } from "react";

import { ChevronDown, ChevronUp } from "../icons";

export interface NumberFieldProps {
    id?: string;
    value: number | null | undefined;
    onValueChange: (next: number | null) => void;
    /** When `true`, an empty input means `null`. When `false`, it coerces to `0`. */
    nullable?: boolean;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    suffix?: ReactNode;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    "aria-invalid"?: boolean;
    /**
     * `Intl.NumberFormatOptions` forwarded to Base UI so the input re-formats live as the
     * operator types (thousand separators, decimal cap). Without it Base UI only re-formats on
     * blur, so money fields render their raw digits mid-edit ("835617000000000") and look
     * broken.
     */
    format?: Intl.NumberFormatOptions;
    /** Locale forwarded to Base UI for `format` consistency — defaults to `en-US` for stable grouping. */
    locale?: string;
}

/**
 * Tier-2 numeric input. Wraps Base UI's `NumberField`. Always LTR — digits read left-to-right even
 * under Persian UI (the Persian digit rendering happens at the formatter level for *display* of
 * money / counts, not for the input itself; editing numerals always uses ASCII so keyboard +
 * mouse-wheel interactions land on the right glyph).
 *
 * Hover-revealed +/- steppers sit on the trailing side; optional suffix chip (currency, unit) sits
 * before them. Empty input is treated as `null` when `nullable` is `true`, `0` otherwise — matches
 * the existing CurrencyInput contract.
 */
export function NumberField({
    id,
    value,
    onValueChange,
    nullable,
    min,
    max,
    step = 1,
    placeholder,
    suffix,
    className,
    inputClassName,
    disabled,
    "aria-invalid": ariaInvalid,
    format,
    locale = "en-US",
}: NumberFieldProps) {
    return (
        <BaseNumberField.Root
            id={id}
            value={value ?? null}
            onValueChange={(next) => {
                if (next === null) return onValueChange(nullable === true ? null : 0);
                onValueChange(next);
            }}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            format={format}
            locale={locale}
            className={cn("w-full", className)}
        >
            <BaseNumberField.Group
                data-slot="number-field-group"
                dir="ltr"
                className={cn(
                    "group/number-field flex h-9 w-full items-stretch overflow-hidden rounded-md border border-input bg-background text-sm shadow-xs outline-none transition-[color,box-shadow,border-color]",
                    "hover:border-ring/40",
                    "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
                    ariaInvalid === true && "border-destructive ring-destructive/20",
                    disabled === true && "pointer-events-none cursor-not-allowed opacity-50",
                )}
            >
                <BaseNumberField.Input
                    placeholder={placeholder}
                    dir="ltr"
                    className={cn(
                        "min-w-0 flex-1 bg-transparent px-3 text-foreground tabular-nums outline-none placeholder:text-muted-foreground/70",
                        inputClassName,
                    )}
                />
                {suffix !== undefined && (
                    <span
                        className="pointer-events-none flex shrink-0 items-center border-input border-l px-2 text-muted-foreground text-xs uppercase tracking-wide"
                        aria-hidden="true"
                    >
                        {suffix}
                    </span>
                )}
                <div className="flex shrink-0 flex-col border-input border-l">
                    <BaseNumberField.Increment
                        aria-label="Increment"
                        className={cn(
                            "inline-flex h-1/2 w-7 items-center justify-center text-muted-foreground transition-colors",
                            "hover:bg-muted hover:text-foreground",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        <ChevronUp className="size-3" aria-hidden="true" />
                    </BaseNumberField.Increment>
                    <BaseNumberField.Decrement
                        aria-label="Decrement"
                        className={cn(
                            "inline-flex h-1/2 w-7 items-center justify-center border-input border-t text-muted-foreground transition-colors",
                            "hover:bg-muted hover:text-foreground",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        <ChevronDown className="size-3" aria-hidden="true" />
                    </BaseNumberField.Decrement>
                </div>
            </BaseNumberField.Group>
        </BaseNumberField.Root>
    );
}
NumberField.displayName = "NumberField";
