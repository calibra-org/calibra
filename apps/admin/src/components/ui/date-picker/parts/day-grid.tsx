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
 * RDP v9 does **not** auto-flip its `orientation` prop when `dir="rtl"` — the previous button
 * always reports `orientation: "left"`, the next button `"right"`, regardless of direction. The
 * repo's convention for icons in RTL contexts is `className="rtl:rotate-180"` (see
 * `apps/admin/src/views/products/export/step-exporting.tsx`, `media-details-modal.tsx`, etc.).
 * That Tailwind modifier flips the icon under any `dir="rtl"` ancestor, so a previous button
 * visually-on-the-right in RTL ends up pointing right (toward "older" on a Persian timeline)
 * and a next button visually-on-the-left points left.
 */
function PickerChevron({ orientation }: ChevronProps) {
    return orientation === "left" ? (
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
    ) : (
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
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

    /**
     * RDP applies modifier classes to the `<td>` cell, not the inner `<button>`. Linear's design
     * wants the today ring and the selected fill to wrap the day number as a circle — that means
     * styling the button, not the cell. We use Tailwind's `[&_button]:` descendant selector so
     * each modifier class on the cell paints the button instead.
     *
     * The today indicator uses `border-2` (not `ring-inset`) so the visible circle hugs the same
     * outer edge as the selected fill — `ring-inset` paints inside the box and visibly shrinks
     * the circle, which reads as off-centre next to the selected day in the same row.
     */
    const modifiersClassNames = useMemo(
        () => ({
            previewRange: "[&_button]:bg-primary/10 [&_button]:text-foreground",
            today: "[&_button]:border [&_button]:border-foreground/40",
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
                /**
                 * `relative` on `months` is the positioning anchor for the absolutely-placed
                 * nav buttons. Without it the buttons fall through to the Dialog's `fixed`
                 * popup and end up colliding with the field-label / operator-chips header.
                 */
                months: "relative flex flex-col sm:flex-row gap-4 pt-1",
                month: "space-y-3 flex-1",
                month_caption: "flex h-8 items-center justify-center text-sm font-semibold",
                caption_label: "text-sm",
                nav: "contents",
                button_previous:
                    "absolute start-1 top-1 z-10 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                button_next:
                    "absolute end-1 top-1 z-10 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                weekday: "text-muted-foreground text-xs font-normal pb-1 text-center",
                /**
                 * Day cell: `p-0.5` gives the day-number circles breathing room so they don't
                 * touch their neighbours, and `text-center` keeps the inline-flex button below
                 * centred horizontally inside the cell. `grid` on the cell would override
                 * `display: table-cell` and collapse the whole month grid into a single column.
                 */
                day: "p-0.5 text-center",
                /**
                 * Day-number button: `size-8` (32 px) is small enough that 7 columns × 2 months
                 * still fit comfortably inside `max-w-xl` without horizontal overflow.
                 * `rounded-full` gives Linear-style circular cells; the today border + selected
                 * fill (both applied via the descendant-button modifier classes above) paint
                 * the same outer circle so indicators sit concentric across the same week row.
                 */
                day_button:
                    "mx-auto inline-flex size-8 items-center justify-center rounded-full text-sm leading-none outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                outside: "text-muted-foreground/40",
                selected: "[&_button]:!bg-primary [&_button]:!text-primary-foreground [&_button]:hover:!bg-primary",
                /**
                 * Range visualization: the lighter band is painted on the `<td>` itself so the
                 * `p-0.5` cell padding fills with colour and adjacent cells join into a
                 * continuous strip. The button keeps its `rounded-full` circle on top so the
                 * start / end days still read as Linear-style filled circles.
                 */
                range_start: "bg-primary/15 [&_button]:!bg-primary [&_button]:!text-primary-foreground",
                range_end: "bg-primary/15 [&_button]:!bg-primary [&_button]:!text-primary-foreground",
                range_middle: "bg-primary/15 [&_button]:!bg-transparent [&_button]:!text-foreground [&_button]:hover:!bg-primary/10",
                disabled: "text-muted-foreground/30 cursor-not-allowed",
            }}
        />
    );
}
