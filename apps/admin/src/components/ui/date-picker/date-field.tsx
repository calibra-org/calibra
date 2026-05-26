"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { CalendarDays } from "#/icons";
import { cn } from "#/lib/utils";

import { DatePickerDialog } from "./date-picker-dialog";
import { formatValueOnly } from "./format";
import type { Calendar, DateFilterValue } from "./types";

interface DateFieldProps {
    label?: string;
    /** Single calendar-native day string (YYYY-MM-DD). The field is operator-less by design. */
    value: string | null;
    onChange: (next: string | null) => void;
    locale: "fa" | "en";
    calendar?: Calendar;
    placeholder?: string;
    disabled?: boolean;
    /** Inline form caption rendered under the input. */
    description?: string;
}

/**
 * Form-mode wrapper that exposes a single-date picker as a form field. Per DESIGN_SYSTEM.md §3.8
 * (Calendar-in-Dialog only) the Calendar opens inside a Dialog — the trigger is a plain button
 * owned by this component rather than Base UI's Popover trigger.
 *
 * The underlying picker still supports the full operator grammar; this field collapses every
 * commit to `before <date>` and stores the bare day string.
 */
export function DateField({
    label,
    value,
    onChange,
    locale,
    calendar = locale === "fa" ? "jalali" : "gregorian",
    placeholder,
    disabled = false,
    description,
}: DateFieldProps) {
    const t = useTranslations("DatePicker");
    const [open, setOpen] = useState(false);

    const wrapped: DateFilterValue | null = value === null ? null : { operator: "before", granularity: "day", calendar, value };

    return (
        <div className="space-y-1">
            {label !== undefined && <span className="block font-medium text-foreground text-sm">{label}</span>}
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-start text-sm outline-none transition-colors",
                    "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    "disabled:pointer-events-none disabled:opacity-50",
                )}
            >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className={cn(value === null && "text-muted-foreground/70")}>
                    {value === null
                        ? (placeholder ?? t("pickADate"))
                        : wrapped !== null
                          ? formatValueOnly(wrapped, { locale })
                          : ""}
                </span>
            </button>
            <DatePickerDialog
                open={open}
                onOpenChange={setOpen}
                value={wrapped}
                onChange={(next) => {
                    if (next === null) {
                        onChange(null);
                        return;
                    }
                    if (next.operator === "within") return;
                    onChange(typeof next.value === "string" ? next.value : null);
                }}
                locale={locale}
                calendar={calendar}
                allowedGranularities={["day", "month", "year"]}
                defaultGranularity="day"
                fieldLabel={label}
            />
            {description !== undefined && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
    );
}
