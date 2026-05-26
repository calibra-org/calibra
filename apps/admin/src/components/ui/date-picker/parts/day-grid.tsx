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

    /**
     * In within-mode we hand RDP a `{ from, to }` range (or `{ from: anchor, to: anchor }` while
     * we're between clicks so the anchor day still reads as a one-day "range" via the
     * range_start modifier). In single-mode we hand it a single `Date` — even if `selection` is
     * still a range from a just-flipped operator, we collapse to the start so RDP's range
     * modifiers don't leak into the new single-mode view.
     */
    const selected = useMemo(() => {
        if (operator === "within") {
            if (selection.kind === "range") {
                const start = valueStringToDate(selection.start, "day", dateLib);
                const end = valueStringToDate(selection.end, "day", dateLib);
                if (start === null || end === null) return undefined;
                return { from: start, to: end };
            }
            if (selection.kind === "period" && selection.granularity === "day") {
                const anchor = valueStringToDate(selection.value, "day", dateLib);
                if (anchor === null) return undefined;
                return { from: anchor, to: anchor };
            }
            return undefined;
        }
        if (selection.kind === "period" && selection.granularity === "day") {
            return valueStringToDate(selection.value, "day", dateLib) ?? undefined;
        }
        if (selection.kind === "range") {
            return valueStringToDate(selection.start, "day", dateLib) ?? undefined;
        }
        return undefined;
    }, [dateLib, operator, selection]);

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
            /**
             * Keying RDP on the mode forces a full remount when the operator flips between
             * single and range — without this, RDP's internal modifier cache still paints
             * `range_*` cells from the previous range even after `selected` becomes a single
             * Date in single-mode.
             */
            key={operator === "within" ? "range" : "single"}
            {...dayPickerProps}
            onDayClick={onDayClick}
            onDayMouseEnter={(d) => onDayHover(d)}
            onDayMouseLeave={() => onDayHover(null)}
            numberOfMonths={numberOfMonths}
            dateLib={dateLib}
            dir={locale === "fa" ? "rtl" : "ltr"}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            /**
             * Hiding outside days keeps the range band from leaking into the visually-greyed
             * leading / trailing cells of the next/previous month. With them on, a wide range
             * paints muted text on a primary band — which fails WCAG contrast in dark theme
             * and reads as "this entire month is in the range" when it isn't.
             */
            showOutsideDays={false}
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
                /**
                 * `border-collapse` + `border-spacing-0` kill the default `<table>` cell gaps
                 * (RDP's bundled stylesheet still leaves a hair-line spacing that breaks the
                 * continuous range band when adjacent cells should join into a single strip).
                 */
                month_grid: "border-collapse border-spacing-0",
                weekday: "text-muted-foreground text-xs font-normal pb-1 text-center",
                /**
                 * Day cell: zero padding so the `<td>` background — which paints the range
                 * band — extends edge-to-edge and connects seamlessly with the next day in
                 * the row. `relative` is the positioning context for the `before:` pseudo
                 * that paints the half-cell band on range start / end cells.
                 */
                day: "relative h-9 w-9 p-0 align-middle text-center",
                /**
                 * Day-number button: `size-8` (32 px) sits inside the 36 px cell with a 2 px
                 * gutter on every side, so the today border + selected fill never touch the
                 * numerals in adjacent cells. `relative z-10` keeps the button above the
                 * `before:` pseudo that paints the range half-band on start / end cells.
                 */
                day_button:
                    "relative z-10 mx-auto inline-flex size-8 items-center justify-center rounded-full text-sm leading-none outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                outside: "text-muted-foreground/30",
                selected: "[&_button]:!bg-primary [&_button]:!text-primary-foreground [&_button]:hover:!bg-primary",
                /**
                 * Range visualization (Linear-style):
                 * - middle days paint their full `<td>` with `bg-primary/30` so adjacent cells
                 *   join into one continuous band; the day number stays on a WHITE-equivalent
                 *   `text-foreground` so the band passes WCAG AA on the dark theme;
                 * - start / end cells paint only HALF of the cell via a `before:` pseudo, so
                 *   the band visually starts at the selected circle's centre rather than the
                 *   cell edge. `start-1/2` + `end-0` (logical Tailwind) auto-flips in RTL,
                 *   which we need because Persian timelines run right→left. `rounded-s-full`
                 *   / `rounded-e-full` give the band a pill cap that hugs the selected circle.
                 */
                /**
                 * The band sits at `inset-y-0.5` (2 px from each cell edge) so its 32 px
                 * height matches the `size-8` button exactly. With matched diameters the
                 * `rounded-s-full` / `rounded-e-full` cap traces the same circle as the start
                 * / end button, and the cap + circle read as one continuous pill instead of a
                 * smaller band with bulging circles riding on top.
                 */
                range_start:
                    "before:absolute before:inset-y-0.5 before:end-0 before:start-1/2 before:rounded-s-full before:bg-primary [&_button]:!bg-primary [&_button]:!text-primary-foreground",
                range_end:
                    "before:absolute before:inset-y-0.5 before:start-0 before:end-1/2 before:rounded-e-full before:bg-primary [&_button]:!bg-primary [&_button]:!text-primary-foreground",
                range_middle:
                    "before:absolute before:inset-y-0.5 before:inset-x-0 before:bg-primary [&_button]:!bg-transparent [&_button]:!text-primary-foreground [&_button]:hover:!bg-primary",
                disabled: "text-muted-foreground/30 cursor-not-allowed before:!hidden [&_button]:!bg-transparent",
            }}
        />
    );
}
