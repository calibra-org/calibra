import { describe, expect, it } from "vitest";

import {
    DAY_GRID_CLASS_NAMES,
    DAY_GRID_DIMENSIONS,
    DAY_GRID_MODIFIER_CLASS_NAMES,
    TWO_MONTH_MIN_WIDTH_PX,
} from "../day-grid-classes";

/**
 * These tests don't verify visual output — they assert *invariants* of the class strings so a
 * future edit doesn't silently break a modifier combination. The day grid renders many
 * overlapping modifier states (today + selected, range_start + today, previewRange + outside,
 * etc.) and the only way to catch a regression cheaply is to encode the rules here.
 */

const SELECTED_STATES = ["selected", "range_start", "range_end", "range_middle"] as const;

function classList(s: string): string[] {
    return s.split(/\s+/).filter((c) => c.length > 0);
}

describe("DAY_GRID_DIMENSIONS — derived layout constants", () => {
    it("matches the day cell's Tailwind size (h-9 w-9 → 36 px)", () => {
        expect(DAY_GRID_DIMENSIONS.cellPx).toBe(36);
        expect(DAY_GRID_CLASS_NAMES.day).toMatch(/\bw-9\b/);
        expect(DAY_GRID_CLASS_NAMES.day).toMatch(/\bh-9\b/);
    });

    it("matches the inter-month gap class (gap-4 → 16 px)", () => {
        expect(DAY_GRID_DIMENSIONS.monthsGapPx).toBe(16);
        expect(DAY_GRID_CLASS_NAMES.months).toMatch(/\bgap-4\b/);
    });

    it("matches the day-grid root horizontal padding (p-2 → 8 px × 2 sides = 16 px)", () => {
        expect(DAY_GRID_DIMENSIONS.rootPaddingPx).toBe(16);
        expect(DAY_GRID_CLASS_NAMES.root).toMatch(/\bp-2\b/);
    });

    it("TWO_MONTH_MIN_WIDTH_PX is computed from cellPx × columns × 2 + gap + padding (no magic constants)", () => {
        const expected =
            DAY_GRID_DIMENSIONS.columnsPerMonth * DAY_GRID_DIMENSIONS.cellPx * 2 +
            DAY_GRID_DIMENSIONS.monthsGapPx +
            DAY_GRID_DIMENSIONS.rootPaddingPx;
        expect(TWO_MONTH_MIN_WIDTH_PX).toBe(expected);
        /** Sanity-bound the value so a future cellPx tweak that triples the threshold gets noticed. */
        expect(TWO_MONTH_MIN_WIDTH_PX).toBeGreaterThan(400);
        expect(TWO_MONTH_MIN_WIDTH_PX).toBeLessThan(800);
    });
});

describe("DAY_GRID_CLASS_NAMES — base layout", () => {
    it("does NOT paint a cell border — today's ring lives on the inner button so it traces a circle, not a square", () => {
        expect(DAY_GRID_CLASS_NAMES.day).not.toMatch(/\bborder\b/);
    });

    it("sets a deterministic cell size (36×36) so the rounded-full caps form a perfect semicircle", () => {
        expect(DAY_GRID_CLASS_NAMES.day).toMatch(/\bh-9\b/);
        expect(DAY_GRID_CLASS_NAMES.day).toMatch(/\bw-9\b/);
    });

    it("uses border-collapse + border-spacing-0 so the range band joins seamlessly across cells", () => {
        expect(DAY_GRID_CLASS_NAMES.month_grid).toMatch(/\bborder-collapse\b/);
        expect(DAY_GRID_CLASS_NAMES.month_grid).toMatch(/\bborder-spacing-0\b/);
    });

    it("positions the months container `relative` so the absolute nav buttons anchor inside it", () => {
        expect(DAY_GRID_CLASS_NAMES.months).toMatch(/\brelative\b/);
        expect(DAY_GRID_CLASS_NAMES.button_previous).toMatch(/\babsolute\b/);
        expect(DAY_GRID_CLASS_NAMES.button_next).toMatch(/\babsolute\b/);
    });

    it("uses logical start/end (not left/right) on nav buttons so they auto-flip in RTL", () => {
        expect(DAY_GRID_CLASS_NAMES.button_previous).toMatch(/\bstart-1\b/);
        expect(DAY_GRID_CLASS_NAMES.button_next).toMatch(/\bend-1\b/);
        expect(DAY_GRID_CLASS_NAMES.button_previous).not.toMatch(/\bleft-/);
        expect(DAY_GRID_CLASS_NAMES.button_next).not.toMatch(/\bright-/);
    });
});

describe("DAY_GRID_CLASS_NAMES — selection states", () => {
    it("every selected state paints `bg-primary` so the band has consistent fill colour", () => {
        for (const state of SELECTED_STATES) {
            expect(DAY_GRID_CLASS_NAMES[state]).toMatch(/\bbg-primary\b/);
        }
    });

    it("every selected state forces text to `text-primary-foreground` for WCAG-passing contrast on the band", () => {
        for (const state of SELECTED_STATES) {
            expect(DAY_GRID_CLASS_NAMES[state]).toMatch(/\btext-primary-foreground\b/);
        }
    });

    it("every selected state suppresses today's ring on the inner button so the circle reads as one filled shape", () => {
        for (const state of SELECTED_STATES) {
            expect(DAY_GRID_CLASS_NAMES[state]).toMatch(/\[&_button\]:!ring-0/);
        }
    });

    it("range_middle stays square — no rounded-* class — so adjacent middle cells join into one strip", () => {
        const classes = classList(DAY_GRID_CLASS_NAMES.range_middle);
        const roundedClasses = classes.filter((c) => c.startsWith("rounded-"));
        expect(roundedClasses).toEqual([]);
    });

    it("range_start rounds the start side, range_end rounds the end side, selected rounds the full circle", () => {
        expect(DAY_GRID_CLASS_NAMES.range_start).toMatch(/\brounded-s-full\b/);
        expect(DAY_GRID_CLASS_NAMES.range_end).toMatch(/\brounded-e-full\b/);
        expect(DAY_GRID_CLASS_NAMES.selected).toMatch(/\brounded-full\b/);
    });

    it("range_start does NOT round the end side, and vice versa — so the cap joins the band cleanly", () => {
        expect(DAY_GRID_CLASS_NAMES.range_start).not.toMatch(/\brounded-e-/);
        expect(DAY_GRID_CLASS_NAMES.range_end).not.toMatch(/\brounded-s-/);
    });
});

describe("DAY_GRID_MODIFIER_CLASS_NAMES — overlay modifiers", () => {
    it("anchor reads as a filled circle, same shape as selected", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!rounded-full/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!bg-primary\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!text-primary-foreground/);
    });

    it("anchor uses `!` on shape + bg + text so it wins when it co-fires with previewStart / previewEnd", () => {
        /** The anchor day IS one end of the preview range (it's where the user clicked first).
         * Without `!important` the previewStart/previewEnd classes — which paint a translucent
         * `bg-primary/40` half-cap — would override the solid `bg-primary` circle anchor
         * deserves. Locking the `!` invariant prevents a future tweak from making the anchor
         * accidentally translucent. */
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!rounded-full/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!bg-primary\b/);
    });

    it("anchor also suppresses today's ring on the inner button (it's a filled circle)", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/\[&_button\]:!ring-0/);
    });

    it("today's modifier paints a CIRCULAR ring on the inner `<button>`, never a square border on the cell", () => {
        /** A border on a `<td>` paints a 36×36 square outline — visually a vertical hairline,
         * not the circular ring users associate with "today". The ring must live on the
         * inner `rounded-full` button so its shape follows the circle. */
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).toMatch(/\[&_button\]:ring-\d/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).toMatch(/\[&_button\]:ring-foreground\/\d+/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).not.toMatch(/\bborder\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).not.toMatch(/\bbg-/);
    });

    it("preview is split into start/middle/end so the pill caps render at the chronological boundaries, not as flat row-spanning rectangles", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewStart).toMatch(/\brounded-s-full\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewEnd).toMatch(/\brounded-e-full\b/);
        const middleClasses = classList(DAY_GRID_MODIFIER_CLASS_NAMES.previewMiddle);
        expect(middleClasses.filter((c) => c.startsWith("rounded-"))).toEqual([]);
    });

    it("every preview slot paints a translucent band, never solid `bg-primary` — keeps preview visually distinct from committed", () => {
        for (const slot of ["previewStart", "previewEnd", "previewMiddle"] as const) {
            expect(DAY_GRID_MODIFIER_CLASS_NAMES[slot]).toMatch(/\bbg-primary\/\d+/);
            expect(DAY_GRID_MODIFIER_CLASS_NAMES[slot]).not.toMatch(/\bbg-primary\b(?!\/)/);
        }
    });

    it("preview cells use `text-primary-foreground` so day numbers read at WCAG-AA on the translucent primary band", () => {
        for (const slot of ["previewStart", "previewEnd", "previewMiddle"] as const) {
            expect(DAY_GRID_MODIFIER_CLASS_NAMES[slot]).toMatch(/\btext-primary-foreground\b/);
        }
    });

    it("previewStart does NOT round the end side, and vice versa — caps go on the outer edge only", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewStart).not.toMatch(/\brounded-e-/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewEnd).not.toMatch(/\brounded-s-/);
    });
});

describe("modifier composition — overlap invariants", () => {
    it("selected + today: `!ring-0` on the button wins → no ring on the inner filled circle", () => {
        /** When the selected day is also today, both modifiers fire on the same cell. Today
         * paints `[&_button]:ring-1 ring-foreground/40`; every selected state paints
         * `[&_button]:!ring-0`. The `!important` on the selected side outranks the
         * non-important ring-1, so the ring drops out and the cell reads as a solid filled
         * circle (or band cap) with no stray outline. */
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).toMatch(/\[&_button\]:ring-\d/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.today).not.toMatch(/!ring-/);
        for (const state of SELECTED_STATES) {
            expect(DAY_GRID_CLASS_NAMES[state]).toMatch(/\[&_button\]:!ring-0/);
        }
    });

    it("preview + anchor (within-mode mid-pick): anchor wins via `!` so the anchor cell stays a solid circle even when previewStart/End also matches it", () => {
        /** The anchor day is one end of the preview range (matches previewStart OR
         * previewEnd). The anchor class uses `!bg-primary` and `!rounded-full` so the solid
         * circle wins over the translucent half-cap on the same cell. */
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/!bg-primary\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewStart).toMatch(/\bbg-primary\/\d+/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewEnd).toMatch(/\bbg-primary\/\d+/);
    });

    it("disabled never paints a coloured bg and forces `!bg-transparent` so co-fired range modifiers can't leak the band onto it", () => {
        expect(DAY_GRID_CLASS_NAMES.disabled).toMatch(/!bg-transparent/);
        const classes = classList(DAY_GRID_CLASS_NAMES.disabled);
        const colouredBgs = classes.filter((c) => c.startsWith("bg-") && !c.startsWith("bg-transparent"));
        expect(colouredBgs).toEqual([]);
    });

    it("outside days force `!bg-transparent` + `!rounded-none` so the band can't leak onto hidden-button cells", () => {
        /** With `showOutsideDays={false}` the inner button is suppressed, but the `<td>`
         * still gets range_* / preview* modifiers if the date lands in the picked range.
         * Without these overrides, the band paints on the empty cell and the user sees a
         * "highlighted blank row" leaking into the prev/next month's leading days. */
        expect(DAY_GRID_CLASS_NAMES.outside).toMatch(/!bg-transparent/);
        expect(DAY_GRID_CLASS_NAMES.outside).toMatch(/!rounded-none/);
    });
});
