"use client";

import { useTranslations } from "next-intl";

import { NumberField } from "#/components/ui/number-field";
import { rialToToman, tomanToRial } from "#/lib/money";

export interface MoneyInputProps {
    id?: string;
    /** Money amount in MINOR units (Rial). 1 Toman = 10 Rial. */
    valueMinor: number | null | undefined;
    /** Receives the new MINOR-unit value, or `null` when cleared (only emitted if `nullable`). */
    onChangeMinor: (next: number | null) => void;
    nullable?: boolean;
    /** Display suffix; defaults to the localized "Toman" chip. */
    suffix?: string;
    min?: number;
    /** Toman step. Defaults to 1000 — keeps wheel-scroll changes meaningful. */
    step?: number;
    placeholder?: string;
    disabled?: boolean;
    "aria-invalid"?: boolean;
    className?: string;
}

/**
 * The Toman ↔ Rial round-trip is the source of truth for every money input in the admin.
 * Display: minor ÷ 10. Commit: Toman × 10 (rounded). When a caller forgets to use this, money
 * fields silently drift by a factor of 10 — never write a raw `<Input type="number">` for
 * pricing.
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
    const t = useTranslations("Common.money");
    /**
     * Toman is the operator-facing unit; admins type and read whole numbers (1 Rial precision
     * is invisible noise). Round the display value before handing it to NumberField so seeds
     * like 6,376,171 Rial render as "637,617" instead of "637,617.1" — but commit unchanged
     * when the operator doesn't touch the field, so the original sub-Toman value isn't
     * silently rewritten until they actually edit.
     */
    const major = rialToToman(valueMinor ?? null);
    const displayMajor = major === null ? null : Math.round(major);
    const resolvedSuffix = suffix ?? t("tomanShort");
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
                onChangeMinor(tomanToRial(next));
            }}
            nullable={nullable}
            min={min}
            step={step}
            suffix={resolvedSuffix}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={className}
        />
    );
}
