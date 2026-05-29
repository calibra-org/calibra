"use client";

import { baseMinorToMajor, parseMajorToBaseMinor } from "@calibra/shared/money";

import { NumberField } from "#/components/ui/number-field";
import { useMoney } from "#/lib/currency/provider";

export interface MoneyInputProps {
    id?: string;
    /** Money amount in BASE MINOR units (Rial). */
    valueMinor: number | null | undefined;
    /** Receives the new BASE-MINOR value, or `null` when cleared (only emitted if `nullable`). */
    onChangeMinor: (next: number | null) => void;
    nullable?: boolean;
    /** Display suffix; defaults to the store display-currency symbol. */
    suffix?: string;
    min?: number;
    /** Step in display-currency MAJOR units. Defaults to 1000 — keeps wheel-scroll meaningful. */
    step?: number;
    placeholder?: string;
    disabled?: boolean;
    "aria-invalid"?: boolean;
    className?: string;
}

/**
 * The single source of truth for every money input in the admin. The external contract is always
 * BASE MINOR units (Rial); internally it shows the store's DISPLAY currency major value using the
 * configured `base_ratio` + symbol (no hardcoded ÷10). Never write a raw `<Input type="number">`
 * for pricing — money would silently drift when the store currency changes.
 */
export function MoneyInput({
    id,
    valueMinor,
    onChangeMinor,
    nullable,
    suffix,
    min = 0,
    step = 1000,
    placeholder,
    disabled,
    "aria-invalid": ariaInvalid,
    className,
}: MoneyInputProps) {
    const { config } = useMoney();
    const decimals = Math.max(0, config.decimals);
    const factor = 10 ** decimals;
    /**
     * Round the display value to the currency's decimals before handing it to NumberField, but
     * commit only when the operator edits — so an untouched sub-unit value isn't rewritten.
     */
    const major = valueMinor === null || valueMinor === undefined ? null : baseMinorToMajor(valueMinor, config);
    const displayMajor = major === null ? null : Math.round(major * factor) / factor;
    const resolvedSuffix = suffix ?? config.symbol;
    return (
        <NumberField
            id={id}
            value={displayMajor}
            onValueChange={(next) => {
                if (next === null || next === undefined) {
                    if (nullable) onChangeMinor(null);
                    else onChangeMinor(0);
                    return;
                }
                onChangeMinor(parseMajorToBaseMinor(next, config));
            }}
            nullable={nullable}
            min={min}
            step={step}
            suffix={resolvedSuffix}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={className}
            /**
             * Live grouping (1,234,567); fraction digits track the currency config. Locale pins to
             * en-US so the thousand separator stays a comma in the LTR digit-entry mode the input
             * forces — the configured Persian `٬` would clash mid-edit.
             */
            format={{ maximumFractionDigits: decimals, useGrouping: true }}
        />
    );
}
