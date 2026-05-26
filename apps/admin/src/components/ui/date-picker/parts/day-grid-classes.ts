/**
 * Class-name orchestration for the {@link DayGrid}, extracted out of the component so the
 * conditional Tailwind strings sit in one auditable place. The day grid renders a lot of
 * overlapping modifier states (today, selected, range_start, range_end, range_middle,
 * previewRange, anchor, outside, disabled) and the classes need to compose in a deterministic
 * way — any time two modifiers fire on the same cell, the visible outcome must be the one the
 * design calls for, not whichever Tailwind happened to emit later in the stylesheet.
 *
 * Design choices:
 *
 * 1. **Background lives on the `<td>`, not on a `::before` pseudo.** The pseudo-element approach
 *    worked for half-cell range caps but broke when other modifiers (today border,
 *    previewRange) layered on top — z-index ordering between content, ::before, and the inner
 *    button was finicky and the day numbers occasionally disappeared in preview mode. The cell
 *    background is simpler, has predictable stacking, and inherits text colour correctly.
 *
 * 2. **`rounded-s-full` / `rounded-e-full` on the cell itself** gives the pill caps. A 36×36
 *    cell with radius `9999px` clamps to `min(W/2, H/2) = 18`, so the two start-side corners
 *    meet at the cell-edge midpoint and form a clean semicircle. Range-start cells curve on
 *    their start (LTR=left, RTL=right) side; range-end on the opposite side; range_middle
 *    stays square so adjacent cells join into one continuous strip.
 *
 * 3. **Today's border is suppressed on every selected state** — `border-transparent` on
 *    selected/range_start/range_end/range_middle/anchor cells so the outline doesn't outline
 *    the inner day number when the cell already paints a band.
 *
 * 4. **Text colour is whatever paints the day-number legibly on the cell's current background.**
 *    `text-foreground` (light) on the dark default cell bg; `text-primary-foreground` (dark)
 *    once the cell paints `bg-primary`. The day_button itself has no text-color class so it
 *    inherits from the cell.
 *
 * 5. **`previewRange` uses a translucent band (`bg-primary/30`)** so the hover trail reads as a
 *    "ghost" of the eventual range, distinct from the committed band.
 */

/**
 * The full `classNames` config passed to `<DayPicker>` (everything you can override per slot).
 * Top-level slots (root, months, day, day_button, …) plus the per-state modifier slots
 * (selected, range_start, …). RDP only applies the modifier class when its matcher fires, so
 * the day cell's final class list is `day` + one or more modifier strings concatenated.
 */
export const DAY_GRID_CLASS_NAMES = {
    root: "p-2 text-foreground",
    /**
     * `relative` is the positioning anchor for the absolutely-placed nav buttons. `pt-1` lifts
     * the captions slightly below the nav buttons so they share a clean baseline.
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
    /** `border-collapse` + `border-spacing-0` kill the table's default cell gaps so the range
     * band is one continuous strip without a hair-line gap between cells. */
    month_grid: "border-collapse border-spacing-0",
    weekday: "text-muted-foreground text-xs font-normal pb-1 text-center",
    /**
     * Day cell is a 36×36 square. `align-middle` + the button's inline-flex centring keep the
     * numeral on the geometric centre. The today indicator is painted on the inner button as
     * a `ring-` utility (see modifiers below) — NOT on the cell — because a square cell with
     * a 1 px border draws a SQUARE outline, which read as a vertical hairline next to the day
     * number, not the circular "today" ring users expect.
     */
    day: "h-9 w-9 p-0 align-middle text-center",
    /**
     * Day-number button: 32 px circle inside the 36 px cell. No explicit text colour so it
     * inherits from the cell — whichever modifier paints the cell also dictates the readable
     * day-number colour.
     */
    day_button:
        "mx-auto inline-flex size-8 items-center justify-center rounded-full text-sm leading-none outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
    outside: "text-muted-foreground/30",
    /**
     * Single-day selected (operator !== "within") — the whole cell becomes a filled circle.
     * `!ring-0` on the button suppresses today's circular ring when both modifiers overlap.
     */
    selected: "rounded-full bg-primary text-primary-foreground [&_button]:!ring-0",
    /**
     * Range cap: the cell becomes a pill with one rounded end. `rounded-s-full` rounds the
     * start side (LTR=left, RTL=right) so it caps the cell on the side that DOESN'T continue
     * into the range. The opposite side stays square so it joins the next cell's band.
     *
     * The Tailwind `9999px` radius clamps to half the cell's smallest dimension (18 for a 36
     * cell), so the two start-side corners meet at the start-edge midpoint and form a
     * geometrically-perfect semicircle.
     */
    range_start: "rounded-s-full bg-primary text-primary-foreground [&_button]:!ring-0",
    range_end: "rounded-e-full bg-primary text-primary-foreground [&_button]:!ring-0",
    /** Middle: square `<td>` filled edge-to-edge so adjacent cells form one continuous strip. */
    range_middle: "bg-primary text-primary-foreground [&_button]:!ring-0",
    disabled: "text-muted-foreground/30 cursor-not-allowed",
} as const;

/**
 * The `modifiersClassNames` config passed to `<DayPicker>` — for our own custom modifiers
 * (anchor, previewRange) plus RDP's built-in `today`.
 */
export const DAY_GRID_MODIFIER_CLASS_NAMES = {
    /**
     * Anchor (within-mode first click before the end is picked). Reads as a clean filled
     * circle, matching what range_start will become once the second click lands. `!` on the
     * shape + bg + text overrides the previewStart / previewEnd modifiers that may co-fire on
     * the anchor day (the anchor is one end of the preview range). `!ring-0` on the button
     * also kills today's circular ring when the anchor lands on today.
     */
    anchor: "!rounded-full !bg-primary !text-primary-foreground [&_button]:!ring-0",
    /**
     * Hover-preview band split into three so the pill is shaped correctly:
     * - previewStart paints the EARLIER end of the preview with a `rounded-s-full` cap;
     * - previewEnd paints the LATER end with a `rounded-e-full` cap;
     * - previewMiddle stays square so adjacent middles join into one strip.
     * `bg-primary/40` is translucent so the preview reads as a "ghost" of the eventual range,
     * not a committed selection. `text-primary-foreground` (white on the typical shadcn dark
     * theme where primary is a vivid colour) passes WCAG AA on a 40 %-opacity primary band.
     */
    previewStart: "rounded-s-full bg-primary/40 text-primary-foreground",
    previewEnd: "rounded-e-full bg-primary/40 text-primary-foreground",
    previewMiddle: "bg-primary/40 text-primary-foreground",
    /**
     * Today's circular ring. Painted on the INNER `<button>` (which is `rounded-full`) via
     * `ring-1` so the outline traces the day-number circle, not the square `<td>`. A border on
     * the cell would draw a square outline, which previously read as a stray vertical line
     * next to the day number — clearly not a "today" indicator.
     *
     * Every selected state above (`selected`, `range_*`, `anchor`) includes
     * `[&_button]:!ring-0` so this ring drops out when the cell already paints a band.
     */
    today: "[&_button]:ring-1 [&_button]:ring-foreground/40",
} as const;
