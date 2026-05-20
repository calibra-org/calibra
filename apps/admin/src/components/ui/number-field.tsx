"use client";

import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface NumberFieldProps {
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
}

/**
 * Polished numeric input on top of Base UI's `NumberField`. Always LTR (digits read left-to-right
 * even under Persian UI), with hover-revealed +/- steppers stacked on the trailing side, and an
 * optional suffix chip (currency, unit). Empty input is treated as `null` when `nullable` is
 * `true`, `0` otherwise — matches the existing CurrencyInput contract.
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
            className={cn("w-full", className)}
        >
            <BaseNumberField.Group
                data-slot="number-field-group"
                className={cn(
                    "group/number-field grid h-9 w-full grid-cols-[1fr_auto] grid-rows-2 overflow-hidden rounded-md border border-input bg-background text-sm shadow-xs outline-none transition-[color,box-shadow,border-color]",
                    "[grid-template-areas:'field_increment''field_decrement']",
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
                        "min-w-0 bg-transparent px-3 text-foreground outline-none placeholder:text-muted-foreground/70 [grid-area:field]",
                        "tabular-nums",
                        inputClassName,
                    )}
                />
                {suffix !== undefined && (
                    <span
                        className="pointer-events-none flex items-center px-2 text-muted-foreground text-xs uppercase tracking-wide [grid-area:field] justify-self-end"
                        aria-hidden="true"
                    >
                        {suffix}
                    </span>
                )}
                <BaseNumberField.Increment
                    aria-label="Increment"
                    className={cn(
                        "inline-flex h-[18px] w-7 items-center justify-center border-input border-s text-muted-foreground transition-colors [grid-area:increment]",
                        "hover:bg-muted hover:text-foreground",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    <ChevronUp className="size-3" aria-hidden="true" />
                </BaseNumberField.Increment>
                <BaseNumberField.Decrement
                    aria-label="Decrement"
                    className={cn(
                        "inline-flex h-[18px] w-7 items-center justify-center border-input border-s border-t text-muted-foreground transition-colors [grid-area:decrement]",
                        "hover:bg-muted hover:text-foreground",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    <ChevronDown className="size-3" aria-hidden="true" />
                </BaseNumberField.Decrement>
            </BaseNumberField.Group>
        </BaseNumberField.Root>
    );
}
