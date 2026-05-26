"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { type ChevronProps, DayPicker, type DayPickerProps } from "react-day-picker";

import { getDateLib, valueStringToDate } from "../date-lib";
import type { Calendar, Operator } from "../types";

import { DAY_GRID_CLASS_NAMES, DAY_GRID_MODIFIER_CLASS_NAMES } from "./day-grid-classes";

/**
 * NOTE: We deliberately do NOT import `react-day-picker/style.css`. Its default styles paint
 * `.rdp-range_start .rdp-day_button { background-color: var(--accent) }`, which gives every
 * range day a solid inner circle and breaks the continuous-pill visual that
 * {@link DAY_GRID_CLASS_NAMES} produces. With the CSS off the only source of truth is our
 * Tailwind class config.
 */

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
     * In within-mode with a complete range we hand RDP a `{ from, to }` range. With only the
     * anchor staged (between the two clicks) we pass `undefined` so RDP doesn't try to render
     * a 1-day range — applying both `range_start` AND `range_end` to the same cell makes the
     * `before:` pseudos clash and the cell looks broken / unclickable. The anchor day is
     * painted separately via the `anchor` modifier below.
     * In single-mode we collapse any leftover range to its start so RDP gets a `Date` (the
     * shape its single mode expects).
     */
    const selected = useMemo(() => {
        if (operator === "within") {
            if (selection.kind === "range") {
                const start = valueStringToDate(selection.start, "day", dateLib);
                const end = valueStringToDate(selection.end, "day", dateLib);
                if (start === null || end === null) return undefined;
                return { from: start, to: end };
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

    /** Anchor day in within-mode mid-selection — painted by a dedicated `anchor` modifier so it
     * reads as a clean filled circle (same shape as the eventual range_start cap) without
     * conflicting with the start/end pseudo-element layout. */
    const anchorDate = useMemo(() => {
        if (operator !== "within") return undefined;
        if (selection.kind !== "period" || selection.granularity !== "day") return undefined;
        return valueStringToDate(selection.value, "day", dateLib) ?? undefined;
    }, [dateLib, operator, selection]);

    const previewRange = useMemo(() => {
        if (operator !== "within") return undefined;
        if (selection.kind !== "period" || selection.granularity !== "day") return undefined;
        const anchor = valueStringToDate(selection.value, "day", dateLib);
        if (anchor === null || hoveredDay === null) return undefined;
        return anchor <= hoveredDay ? { from: anchor, to: hoveredDay } : { from: hoveredDay, to: anchor };
    }, [dateLib, hoveredDay, operator, selection]);

    /**
     * Split the preview range into three matchers so the cells at each end can paint a
     * `rounded-s-full` / `rounded-e-full` cap (the pill ends), while everything between
     * stays square and joins into one continuous strip. Same geometry as the committed
     * range — RDP already handles cross-row breaks for us by only matching cells
     * chronologically in the range.
     */
    const previewStartDate = previewRange?.from;
    const previewEndDate = previewRange?.to;
    const previewMiddleRange = useMemo(() => {
        if (previewRange === undefined) return undefined;
        if (previewRange.from.getTime() === previewRange.to.getTime()) return undefined;
        return { from: dateLib.addDays(previewRange.from, 1), to: dateLib.addDays(previewRange.to, -1) };
    }, [dateLib, previewRange]);

    const modifiers = useMemo(
        () => ({
            previewStart: previewStartDate ?? [],
            previewEnd: previewEndDate ?? [],
            previewMiddle: previewMiddleRange ?? [],
            anchor: anchorDate ?? [],
        }),
        [anchorDate, previewEndDate, previewMiddleRange, previewStartDate],
    );

    /**
     * Class orchestration lives in `day-grid-classes.ts` with paired unit tests so the
     * modifier-overlap invariants (today + selected, previewRange + anchor, etc.) are encoded
     * once and don't drift the next time someone tweaks the visual.
     */
    const modifiersClassNames = useMemo(() => ({ ...DAY_GRID_MODIFIER_CLASS_NAMES }), []);

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
            classNames={{ ...DAY_GRID_CLASS_NAMES }}
        />
    );
}
