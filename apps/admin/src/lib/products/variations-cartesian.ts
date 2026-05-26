/**
 * Pure helpers for variation generation. Lives in `lib/products/` (not inside the variations
 * card) so the math is testable in isolation — the UI just renders the diff result.
 *
 * Pin model: a variation pins each "use for variations" attribute to either a specific term or
 * the sentinel `null` ("Any term"). Two variations match iff their pin sets are identical (same
 * attribute_id → same term_id for every attribute, with `null === null` being equal).
 */

export interface VariationPin {
    attribute_id: number;
    /** `null` means "Any term" for the attribute. */
    term_id: number | null;
}

export interface AttributeAxis {
    attribute_id: number;
    /**
     * Term ids the operator selected for this attribute on the product. The cartesian iterator
     * pins each term in turn. An empty array means the axis is skipped (no terms = no variations
     * to generate along this axis). To explicitly include an "Any term" branch alongside specific
     * terms, append `null` to this list.
     */
    term_ids: (number | null)[];
}

export interface CartesianDiff<TExisting extends { pins: VariationPin[] }> {
    /** Combinations from the cartesian that don't match any existing variation — to be created. */
    create: VariationPin[][];
    /** Existing variations whose pins still match a cartesian combination — keep as-is. */
    unchanged: TExisting[];
    /** Existing variations whose pins no longer match anything — candidates for deletion. */
    outdated: TExisting[];
}

/**
 * Returns the cartesian product of attribute terms. One pin set per combination. Skips axes with
 * an empty `term_ids` array (an axis with zero choices contributes nothing — and yields zero
 * total combinations across the rest, which is the right semantics: "I haven't picked any terms
 * for size yet, so I can't enumerate `size × color`").
 */
export function cartesianPins(axes: AttributeAxis[]): VariationPin[][] {
    const usable = axes.filter((axis) => axis.term_ids.length > 0);
    if (usable.length === 0) return [];
    let acc: VariationPin[][] = [[]];
    for (const axis of usable) {
        const next: VariationPin[][] = [];
        for (const partial of acc) {
            for (const termId of axis.term_ids) {
                next.push([...partial, { attribute_id: axis.attribute_id, term_id: termId }]);
            }
        }
        acc = next;
    }
    return acc;
}

/**
 * Equality on pin sets. Order-insensitive. Two pins match iff `(attribute_id, term_id)` is
 * identical, with `term_id: null === null`. Used by the diff to match existing variations
 * against generated combinations.
 */
export function pinSetsEqual(a: VariationPin[], b: VariationPin[]): boolean {
    if (a.length !== b.length) return false;
    const indexA = new Map<number, number | null>();
    for (const pin of a) indexA.set(pin.attribute_id, pin.term_id);
    for (const pin of b) {
        if (!indexA.has(pin.attribute_id)) return false;
        if (indexA.get(pin.attribute_id) !== pin.term_id) return false;
    }
    return true;
}

/**
 * Diffs the cartesian against existing variations. The result is what powers the
 * "Generate from all attributes" confirmation dialog:
 *   - `create` — new pin sets the user is about to materialize.
 *   - `unchanged` — existing variations that survive the regeneration.
 *   - `outdated` — existing variations whose pins are no longer on the cartesian (opt-in delete).
 */
export function diffCartesian<TExisting extends { pins: VariationPin[] }>(
    axes: AttributeAxis[],
    existing: TExisting[],
): CartesianDiff<TExisting> {
    const target = cartesianPins(axes);
    const unchanged: TExisting[] = [];
    const matchedTargetIndices = new Set<number>();
    for (const variation of existing) {
        const idx = target.findIndex((pins) => pinSetsEqual(pins, variation.pins));
        if (idx >= 0) {
            unchanged.push(variation);
            matchedTargetIndices.add(idx);
        }
    }
    const outdated = existing.filter((variation) => !target.some((pins) => pinSetsEqual(pins, variation.pins)));
    const create = target.filter((_, idx) => !matchedTargetIndices.has(idx));
    return { create, unchanged, outdated };
}
