/**
 * WCAG-friendly text colour utilities. Two strategies:
 *
 *   - `contrastTextColor(bg)` — picks black or white based on the WCAG relative luminance of
 *     the background. Use when you know the exact background colour of the text (per-county
 *     polygon fills, per-tile fills, etc.).
 *   - `OUTLINED_LABEL_STYLE` — paint-order outline trick for labels whose background varies
 *     unpredictably (e.g., province name glyphs overlaid on the choropleth where the operator
 *     toggles between palettes). A thick white stroke under a dark fill guarantees readability
 *     on any colour without per-label measurement.
 */

const BLACK = "#0f172a";
const WHITE = "#ffffff";

function srgbToLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
    if (!hex.startsWith("#")) return null;
    let h = hex.slice(1);
    if (h.length === 3) {
        h = h
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
}

/** WCAG relative luminance (0–1). */
export function relativeLuminance(hex: string): number {
    const parsed = parseHex(hex);
    if (!parsed) return 1;
    return 0.2126 * srgbToLinear(parsed.r) + 0.7152 * srgbToLinear(parsed.g) + 0.0722 * srgbToLinear(parsed.b);
}

/**
 * Returns the more readable of black / white against the given background. Threshold 0.4 errs
 * toward white text on medium-saturation reds and oranges (slate-900 starts losing contrast
 * around `red-500` if we use 0.5).
 */
export function contrastTextColor(bg: string): string {
    return relativeLuminance(bg) > 0.4 ? BLACK : WHITE;
}
