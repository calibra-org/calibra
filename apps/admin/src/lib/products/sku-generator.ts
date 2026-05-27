import type { VariationView } from "./queries";

export interface SkuTokenSpec {
    /** Token name as it appears in the pattern (e.g. `color`, `storage`). */
    token: string;
    /** Attribute id this token corresponds to. */
    attributeId: number;
    /** Per-term-id abbreviation table. Empty entries fall back to {@link defaultAbbrev}. */
    abbreviations: Record<number, string>;
}

/**
 * Default abbreviation for a value — first three alphanumeric chars, uppercased. ASCII-only;
 * Persian / Arabic / CJK characters are passed through verbatim because their script doesn't
 * have a natural uppercase form. Falls back to `VAL` when the input has no usable chars.
 */
export function defaultAbbrev(value: string): string {
    const stripped = value.replace(/[^\p{L}\p{N}]/gu, "");
    if (stripped.length === 0) return "VAL";
    const head = stripped.slice(0, 3);
    return head.toUpperCase();
}

export interface SkuApplyResult {
    /** `variation_id → new sku` for every selected row (incl. duplicates). */
    skuByVariationId: Record<number, string>;
    /** SKUs that appear more than once across the selection. Empty when there are no collisions. */
    collisions: string[];
}

/**
 * Render the pattern across every selected variation. Tokens are matched by `{name}` (case-
 * sensitive). Reserved tokens: `{product}` (the parent product's SKU). Unknown tokens are left
 * untouched so a typo doesn't silently disappear from the result.
 */
export function applyPattern(
    pattern: string,
    productSku: string,
    selected: VariationView[],
    tokens: SkuTokenSpec[],
    termNameById: Record<number, string>,
): SkuApplyResult {
    const skuByVariationId: Record<number, string> = {};
    const counts = new Map<string, number>();
    for (const v of selected) {
        let out = pattern;
        out = out.replaceAll("{product}", productSku);
        for (const token of tokens) {
            const pin = v.pins.find((p) => p.attribute_id === token.attributeId);
            if (pin === undefined || pin.term_id === null) {
                out = out.replaceAll(`{${token.token}}`, "");
                continue;
            }
            const abbrev = token.abbreviations[pin.term_id] ?? defaultAbbrev(termNameById[pin.term_id] ?? "");
            out = out.replaceAll(`{${token.token}}`, abbrev);
        }
        out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
        skuByVariationId[v.id] = out;
        counts.set(out, (counts.get(out) ?? 0) + 1);
    }
    const collisions: string[] = [];
    for (const [sku, count] of counts) {
        if (count > 1) collisions.push(sku);
    }
    return { skuByVariationId, collisions };
}
