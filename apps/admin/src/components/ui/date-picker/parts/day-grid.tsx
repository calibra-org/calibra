"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { type ChevronProps, DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

import { getDateLib, valueStringToDate } from "../date-lib";
import type { Calendar, Operator } from "../types";

/**
 * RDP chevron slot. Lives outside the parent so the lint rule against nested component
 * definitions stays happy and so React can stabilise the slot reference across renders.
 *
 * RDP v9 already accounts for `dir="rtl"` by flipping the `orientation` it passes — `previous`
 * arrives as `orientation: "right"` in RTL, `"left"` in LTR. We honour that signal verbatim;
 * any extra locale-aware flipping here would double-invert.
 */
function PickerChevron({ orientation }: ChevronProps) {
    return orientation === "left" ? (
        <ChevronLeft className="size-4" aria-hidden="true" />
    ) : (
        <ChevronRight className="size-4" aria-hidden="true" />
    );
}

interface DayGridProps {
    calendar: Calendar;
    locale: "fa" | "en";
    operator: Operator;
    /**
     * Selection in the hook's wire format. The day grid only acts on day-granularity periods or
     * ranges; non-day periods are silently treated as "nothing selected" so the dialog body can
     * pass the whole selection through without narrowing it.
     */
    selection:
        | { kind: "none" }
        | { kind: "period"; granularity: import("../types").Granularity; value: string }
        | { kind: "range"; start: string; end: string };
    hoveredDay: Date | null;
    onDayClick: (date: Date) => void;
    onDayHover: (date: Date | null) => void;
    /** Two-up on ≥ 640 px viewports; the consumer passes the resolved count. */
    numberOfMonths: number;
}

/**
 * Calendar grid backed by react-day-picker v9. We feed it the calendar-aware `DateLib` so the
 * same component renders Gregorian (Sunday-first) or Jalali (Saturday-first, Persian names)
 * depending on which lib instance we hand it.
 */
export function DayGrid({
    calendar,
    locale,
    operator,
    selection,
    hoveredDay,
    onDayClick,
    onDayHover,
    numberOfMonths,
}: DayGridProps) {
    const dateLib = getDateLib(calendar);

    const selected = useMemo(() => {
        if (selection.kind === "period" && selection.granularity === "day") {
            return valueStringToDate(selection.value, "day", dateLib) ?? undefined;
        }
        if (selection.kind === "range") {
            const start = valueStringToDate(selection.start, "day", dateLib);
            const end = valueStringToDate(selection.end, "day", dateLib);
            if (start === null || end === null) return undefined;
            return { from: start, to: end };
        }
        return undefined;
    }, [dateLib, selection]);

    const previewRange = useMemo(() => {
        if (operator !== "within") return undefined;
        if (selection.kind !== "period" || selection.granularity !== "day") return undefined;
        const anchor = valueStringToDate(selection.value, "day", dateLib);
        if (anchor === null || hoveredDay === null) return undefined;
        return anchor <= hoveredDay ? { from: anchor, to: hoveredDay } : { from: hoveredDay, to: anchor };
    }, [dateLib, hoveredDay, operator, selection]);

    const modifiers = useMemo(
        () => ({
            previewRange: previewRange !== undefined ? { from: previewRange.from, to: previewRange.to } : [],
        }),
        [previewRange],
    );

    const modifiersClassNames = useMemo(
        () => ({
            previewRange: "bg-primary/10 text-foreground",
            today: "ring-1 ring-foreground/40 ring-inset",
        }),
        [],
    );

    /**
     * The DayPicker discriminated-union types refuse to narrow when `mode` is computed at render
     * time, so we widen via the public `DayPickerProps` and let the consumer-facing branches
     * select the right shape — `selected` ends up either a `Date` (single) or `{ from, to }`
     * (range), both of which are valid for the chosen mode.
     */
    const dayPickerProps = (operator === "within"
        ? { mode: "range", selected }
        : { mode: "single", selected }) as unknown as DayPickerProps;

    return (
        <DayPicker
            {...dayPickerProps}
            onDayClick={onDayClick}
            onDayMouseEnter={(d) => onDayHover(d)}
            onDayMouseLeave={() => onDayHover(null)}
            numberOfMonths={numberOfMonths}
            dateLib={dateLib}
            dir={locale === "fa" ? "rtl" : "ltr"}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            showOutsideDays
            components={{ Chevron: PickerChevron }}
            classNames={{
                root: "p-2 text-foreground",
                months: "flex flex-col sm:flex-row gap-4",
                month: "space-y-3 flex-1",
                month_caption: "relative flex h-8 items-center justify-center text-sm font-semibold",
                caption_label: "text-sm",
                nav: "contents",
                button_previous:
                    "absolute start-1 top-0 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                button_next:
                    "absolute end-1 top-0 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                weekday: "text-muted-foreground text-xs font-normal pb-1",
                day_button:
                    "inline-flex size-9 items-center justify-center rounded-md text-sm outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                outside: "text-muted-foreground/40",
                selected: "!bg-primary !text-primary-foreground hover:!bg-primary",
                range_start: "!bg-primary !text-primary-foreground",
                range_end: "!bg-primary !text-primary-foreground",
                range_middle: "!bg-primary/25 !text-foreground rounded-none",
                disabled: "text-muted-foreground/30 cursor-not-allowed",
            }}
        />
    );
}
