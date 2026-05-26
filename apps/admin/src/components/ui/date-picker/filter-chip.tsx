"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "#/lib/utils";

import { DatePickerDialog } from "./date-picker-dialog";
import { formatOperator, formatValueOnly } from "./format";
import { OperatorMenu } from "./operator-menu";
import type { DateFilterValue, Granularity, Operator } from "./types";
import type { UseDateFilterOptions } from "./use-date-filter";

interface DateFilterChipProps {
    fieldLabel: string;
    value: DateFilterValue | null;
    onChange: (next: DateFilterValue | null) => void;
    locale: "fa" | "en";
    calendar?: UseDateFilterOptions["calendar"];
    allowedOperators?: Operator[];
    allowedGranularities?: Granularity[];
    /** Label rendered when no value is set (matches Linear's "+ Due date" affordance). */
    addLabel?: string;
}

/**
 * Three-segment filter chip — `[field-label | operator | value] ✕`. Each segment is its own
 * click target: operator opens the {@link OperatorMenu} popover (no calendar reopen), value opens
 * the {@link DatePickerDialog} pre-populated, the field-label is a passive surface, and × clears
 * the filter outright.
 *
 * When no value is set, the chip collapses into a single "+ <fieldLabel>" affordance.
 */
export function DateFilterChip({
    fieldLabel,
    value,
    onChange,
    locale,
    calendar,
    allowedOperators,
    allowedGranularities,
    addLabel,
}: DateFilterChipProps) {
    const t = useTranslations("DatePicker");
    const [open, setOpen] = useState(false);

    if (value === null) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-md border border-input border-dashed bg-background px-2.5 text-muted-foreground text-xs outline-none transition-colors",
                        "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                >
                    + {addLabel ?? fieldLabel}
                </button>
                <DatePickerDialog
                    open={open}
                    onOpenChange={setOpen}
                    value={value}
                    onChange={onChange}
                    locale={locale}
                    calendar={calendar}
                    allowedOperators={allowedOperators}
                    allowedGranularities={allowedGranularities}
                    fieldLabel={fieldLabel}
                />
            </>
        );
    }

    return (
        <>
            <div
                className={cn(
                    "inline-flex h-7 items-center divide-x divide-border rounded-md border bg-background text-xs",
                    "rtl:divide-x-reverse",
                )}
            >
                <span className="px-2 text-muted-foreground">{fieldLabel}</span>
                <OperatorMenu
                    value={value}
                    onChange={onChange}
                    allowed={allowedOperators}
                    renderTrigger={(triggerProps) => (
                        <button
                            type="button"
                            aria-label={t("changeOperator")}
                            {...triggerProps}
                            className="h-7 px-2 text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {formatOperator(value.operator, locale)}
                        </button>
                    )}
                />
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="h-7 px-2 font-medium text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {formatValueOnly(value, { locale })}
                </button>
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    aria-label={t("clear")}
                    className="grid h-7 w-7 place-items-center text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X className="size-3" aria-hidden="true" />
                </button>
            </div>
            <DatePickerDialog
                open={open}
                onOpenChange={setOpen}
                value={value}
                onChange={onChange}
                locale={locale}
                calendar={calendar}
                allowedOperators={allowedOperators}
                allowedGranularities={allowedGranularities}
                fieldLabel={fieldLabel}
            />
        </>
    );
}
