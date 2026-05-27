import type { VariationView } from "./queries";

export type VersionStatus = VariationView["status"];

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const STATUS_TONES: Record<VersionStatus, StatusTone> = {
    draft: "neutral",
    active: "success",
    inactive: "warning",
    archived: "danger",
};

/**
 * Map a sellable-version `status` to a {@link StatusTone}. Used by the data-grid status cell to
 * pick the right pill colour without inlining a 4-arm ternary at every call site.
 */
export function statusTone(status: VersionStatus): StatusTone {
    return STATUS_TONES[status];
}

export interface TermLookup {
    [termId: number]: string | undefined;
}

/**
 * Build the customer-facing display name for a variation row by joining the chosen term labels
 * with `/`. Order respects the original `pins` array (which mirrors `attribute_links.position`
 * on the wire). Missing term names fall back to `#<id>` so the operator still sees something
 * actionable even before the taxonomy hydrates.
 *
 * Example: `pins = [{attr: color, term: silver}, {attr: storage, term: 256gb}]` →
 * `"نقره‌ای / ۲۵۶ گیگ"` (with the term labels coming from the locale-aware terms query).
 */
export function formatVersionName(
    pins: VariationView["pins"],
    termsByAttribute: Record<number, TermLookup | undefined>,
    fallback: string,
): string {
    const parts: string[] = [];
    for (const pin of pins) {
        if (pin.term_id === null) continue;
        const label = termsByAttribute[pin.attribute_id]?.[pin.term_id] ?? `#${pin.term_id}`;
        parts.push(label);
    }
    return parts.length === 0 ? fallback : parts.join(" / ");
}
