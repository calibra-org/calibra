import { describe, expect, it } from "vitest";

import { DAY_GRID_CLASS_NAMES, DAY_GRID_MODIFIER_CLASS_NAMES } from "../day-grid-classes";

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
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/\brounded-full\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/\bbg-primary\b/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toMatch(/\btext-primary-foreground\b/);
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

    it("previewRange paints a translucent band, never a solid bg-primary — keeps the in-progress range visually distinct from a committed one", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewRange).toMatch(/\bbg-primary\/\d+/);
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewRange).not.toMatch(/\bbg-primary\b(?!\/)/);
    });

    it("previewRange uses `text-foreground` (light on dark theme) so the day numbers stay readable through the translucent band", () => {
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewRange).toMatch(/\btext-foreground\b/);
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

    it("previewRange + anchor (within-mode mid-pick): anchor wins because it's painted on top via the modifier order in DayGrid", () => {
        /** Both modifiers can fire on the anchor cell. Anchor has `bg-primary` (solid),
         * previewRange has `bg-primary/30` (translucent). The DayGrid component is responsible
         * for ordering them in `modifiersClassNames`; this test pins the expected colour
         * shapes so a future swap doesn't silently make the anchor look translucent. */
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.anchor).toContain("bg-primary ");
        expect(DAY_GRID_MODIFIER_CLASS_NAMES.previewRange).toContain("bg-primary/");
    });

    it("disabled never paints a bg — it's a non-interactive cell, not a styled state", () => {
        const classes = classList(DAY_GRID_CLASS_NAMES.disabled);
        const bgs = classes.filter((c) => c.startsWith("bg-"));
        expect(bgs).toEqual([]);
    });
});
