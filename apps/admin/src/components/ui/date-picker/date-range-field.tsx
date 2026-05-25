"use client";

import { CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "#/lib/utils";

import { DatePickerPopover } from "./date-picker-popover";
import { formatValueOnly } from "./format";
import type { Calendar, DateFilterValue } from "./types";

interface DateRangeFieldProps {
    label?: string;
    value: { start: string; end: string } | null;
    onChange: (next: { start: string; end: string } | null) => void;
    locale: "fa" | "en";
    calendar?: Calendar;
    placeholder?: string;
    disabled?: boolean;
    description?: string;
}

/**
 * Form-mode wrapper for picking a closed `[start, end]` day range. Mirrors {@link DateField} but
 * locks the operator to `within` so the operator chips can't drift mid-form.
 */
export function DateRangeField({
    label,
    value,
    onChange,
    locale,
    calendar = locale === "fa" ? "jalali" : "gregorian",
    placeholder,
    disabled = false,
    description,
}: DateRangeFieldProps) {
    const t = useTranslations("DatePicker");
    const [open, setOpen] = useState(false);

    const wrapped: DateFilterValue | null =
        value === null
            ? null
            : { operator: "within", granularity: "day", calendar, start: value.start, end: value.end };

    return (
        <div className="space-y-1">
            {label !== undefined && <span className="block font-medium text-foreground text-sm">{label}</span>}
            <DatePickerPopover
                open={open}
                onOpenChange={setOpen}
                value={wrapped}
                onChange={(next) => {
                    if (next === null) {
                        onChange(null);
                        return;
                    }
                    if (next.operator !== "within") return;
                    onChange({ start: next.start, end: next.end });
                }}
                locale={locale}
                calendar={calendar}
                allowedGranularities={["day"]}
                allowedOperators={["within"]}
                defaultOperator="within"
                defaultGranularity="day"
                fieldLabel={label}
                trigger={
                    <button
                        type="button"
                        disabled={disabled}
                        className={cn(
                            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-start text-sm outline-none transition-colors",
                            "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className={cn(value === null && "text-muted-foreground/70")}>
                            {value === null
                                ? placeholder ?? t("pickARange")
                                : formatValueOnly(wrapped!, { locale })}
                        </span>
                    </button>
                }
            />
            {description !== undefined && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
    );
}
