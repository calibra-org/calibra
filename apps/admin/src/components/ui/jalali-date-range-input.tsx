"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { DateRangeField } from "#/components/ui/date-picker";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export interface JalaliDateRangeValue {
    /** ISO date-only string `YYYY-MM-DD` or `null`. */
    from: string | null;
    to: string | null;
}

export interface JalaliDateRangeInputProps {
    value: JalaliDateRangeValue;
    onChange: (next: JalaliDateRangeValue) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    description?: string;
    className?: string;
    /** Hide the quick-pick row (Today / Last 7 days / …). Defaults to showing it. */
    hideQuickPicks?: boolean;
}

interface QuickPick {
    id: string;
    labelKey: "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";
    range: () => JalaliDateRangeValue;
}

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
}

function quickPicks(): QuickPick[] {
    const today = startOfDay(new Date());
    return [
        { id: "today", labelKey: "today", range: () => ({ from: toIsoDate(today), to: toIsoDate(today) }) },
        {
            id: "yesterday",
            labelKey: "yesterday",
            range: () => ({ from: toIsoDate(addDays(today, -1)), to: toIsoDate(addDays(today, -1)) }),
        },
        {
            id: "last7",
            labelKey: "last7",
            range: () => ({ from: toIsoDate(addDays(today, -6)), to: toIsoDate(today) }),
        },
        {
            id: "last30",
            labelKey: "last30",
            range: () => ({ from: toIsoDate(addDays(today, -29)), to: toIsoDate(today) }),
        },
        {
            id: "thisMonth",
            labelKey: "thisMonth",
            range: () => ({
                from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
                to: toIsoDate(today),
            }),
        },
        {
            id: "lastMonth",
            labelKey: "lastMonth",
            range: () => {
                const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                return { from: toIsoDate(lmStart), to: toIsoDate(lmEnd) };
            },
        },
    ];
}

/**
 * Date range input with a Quick-pick strip beneath the picker. Speaks ISO date-only strings
 * regardless of the active calendar (Jalali / Gregorian) — the underlying {@link DateRangeField}
 * handles the display conversion automatically.
 */
export function JalaliDateRangeInput({
    value,
    onChange,
    label,
    placeholder,
    disabled,
    description,
    className,
    hideQuickPicks,
}: JalaliDateRangeInputProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Common.dateRange");
    const picks = useMemo(quickPicks, []);

    const wrapped = value.from === null || value.to === null ? null : { start: value.from, end: value.to };

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <DateRangeField
                label={label}
                value={wrapped}
                onChange={(next) => onChange(next === null ? { from: null, to: null } : { from: next.start, to: next.end })}
                locale={locale}
                placeholder={placeholder}
                disabled={disabled}
                description={description}
            />
            {!hideQuickPicks && !disabled && (
                <div className="flex flex-wrap gap-1.5">
                    {picks.map((p) => (
                        <Button
                            key={p.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onChange(p.range())}
                        >
                            {t(p.labelKey)}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
