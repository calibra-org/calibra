"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";

/**
 * Always-valued form dropdown on the base-ui `Select` primitive — the console's replacement for a
 * native `<select>` in forms (plan / currency / locale / db-tier). For toolbar filters that need an
 * "all" option, see the `FilterSelect` in the tenants list instead.
 */
export function ConsoleSelect({
    value,
    onValueChange,
    options,
    className,
    ariaLabel,
}: {
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <Select value={value} onValueChange={(next) => onValueChange(String(next))}>
            <SelectTrigger className={className} aria-label={ariaLabel}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
