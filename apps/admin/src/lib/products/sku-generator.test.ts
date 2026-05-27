import { describe, expect, it } from "vitest";

import { applyPattern, defaultAbbrev, type SkuTokenSpec } from "./sku-generator";
import type { VariationView } from "./queries";

/**
 * Locks the cases the operator hit in production. The dialog's "6 duplicates" warning isn't a
 * bug in the renderer — it's a missing-token-in-pattern story — so the test set targets the
 * specific failure modes the editor exposes: incomplete patterns, dropped axes, ASCII vs
 * Persian abbreviation defaults, and the leading/trailing-separator clean-up.
 */

function variation(id: number, pins: { attribute_id: number; term_id: number | null }[]): VariationView {
    return {
        id,
        sku: null,
        gtin: null,
        regularPriceMinor: null,
        salePriceMinor: null,
        saleStartsAt: null,
        saleEndsAt: null,
        weightGrams: null,
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        imageMediaId: null,
        virtual: false,
        downloadable: false,
        manageStockMode: "own",
        menuOrder: 0,
        status: "draft",
        pins,
        description: null,
    };
}

const COLOR_ATTR = 1;
const SIZE_ATTR = 2;
/** Term ids → display names. Mirrors the shape `useAttributeTermsMap` returns. */
const TERM_NAMES: Record<number, string> = {
    10: "قرمز",
    11: "آبی",
    12: "سبز",
    20: "S",
    21: "M",
    22: "L",
};
const TOKENS: SkuTokenSpec[] = [
    { token: "color", attributeId: COLOR_ATTR, abbreviations: {} },
    { token: "size", attributeId: SIZE_ATTR, abbreviations: {} },
];

describe("defaultAbbrev", () => {
    it("uppercases the first three ASCII letters", () => {
        expect(defaultAbbrev("Silver")).toBe("SIL");
        expect(defaultAbbrev("256GB")).toBe("256");
    });

    it("strips punctuation before slicing", () => {
        expect(defaultAbbrev("Natural Titanium")).toBe("NAT");
        expect(defaultAbbrev("ABC-XYZ")).toBe("ABC");
    });

    it("falls back to VAL when nothing usable is left", () => {
        expect(defaultAbbrev("---")).toBe("VAL");
        expect(defaultAbbrev("")).toBe("VAL");
    });

    it("passes Persian characters through verbatim (no uppercase form)", () => {
        expect(defaultAbbrev("قرمز")).toBe("قرم");
        expect(defaultAbbrev("آبی")).toBe("آبی");
        expect(defaultAbbrev("نقره‌ای")).toBe("نقر");
    });
});

describe("applyPattern", () => {
    it("renders one unique SKU per variation when the pattern includes every axis", () => {
        const selected = [
            variation(100, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 20 },
            ]),
            variation(101, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 21 },
            ]),
            variation(102, [
                { attribute_id: COLOR_ATTR, term_id: 11 },
                { attribute_id: SIZE_ATTR, term_id: 22 },
            ]),
        ];
        const result = applyPattern("{product}-{color}-{size}", "ACME", selected, TOKENS, TERM_NAMES);
        expect(result.collisions).toEqual([]);
        expect(result.skuByVariationId).toEqual({
            100: "ACME-قرم-S",
            101: "ACME-قرم-M",
            102: "ACME-آبی-L",
        });
    });

    it("flags collisions when the pattern omits an axis that varies", () => {
        const selected = [
            variation(200, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 20 },
            ]),
            variation(201, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 21 },
            ]),
            variation(202, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 22 },
            ]),
        ];
        /** Pattern lacks `{size}` — all three rows collapse to the same SKU. */
        const result = applyPattern("{product}-{color}", "ACME", selected, TOKENS, TERM_NAMES);
        expect(Object.values(result.skuByVariationId)).toEqual(["ACME-قرم", "ACME-قرم", "ACME-قرم"]);
        expect(result.collisions).toEqual(["ACME-قرم"]);
    });

    it("honours operator-typed abbreviations over the default", () => {
        const customTokens: SkuTokenSpec[] = [
            { token: "color", attributeId: COLOR_ATTR, abbreviations: { 10: "RED", 11: "BLU" } },
            { token: "size", attributeId: SIZE_ATTR, abbreviations: { 20: "SM" } },
        ];
        const selected = [
            variation(300, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 20 },
            ]),
            variation(301, [
                { attribute_id: COLOR_ATTR, term_id: 11 },
                { attribute_id: SIZE_ATTR, term_id: 21 },
            ]),
        ];
        const result = applyPattern("{product}-{color}-{size}", "ACME", selected, customTokens, TERM_NAMES);
        expect(result.skuByVariationId).toEqual({
            300: "ACME-RED-SM",
            /** size 21 has no custom abbrev → falls back to `defaultAbbrev("M")`. */
            301: "ACME-BLU-M",
        });
    });

    it("collapses adjacent and leading/trailing separators", () => {
        const selected = [variation(400, [{ attribute_id: COLOR_ATTR, term_id: 10 }])];
        /** No size pin → `{size}` empties → `-` then `-` collapses to one. Trim trailing. */
        const result = applyPattern("--{product}-{color}-{size}-", "ACME", selected, TOKENS, TERM_NAMES);
        expect(result.skuByVariationId[400]).toBe("ACME-قرم");
    });

    it("ignores tokens whose name doesn't appear in the pattern", () => {
        const selected = [
            variation(500, [
                { attribute_id: COLOR_ATTR, term_id: 10 },
                { attribute_id: SIZE_ATTR, term_id: 20 },
            ]),
        ];
        /** Pattern only references `{color}`, so the size axis is irrelevant. */
        const result = applyPattern("{product}-{color}", "ACME", selected, TOKENS, TERM_NAMES);
        expect(result.skuByVariationId[500]).toBe("ACME-قرم");
    });

    it("treats a row without the relevant pin as an empty token (then collapsed)", () => {
        const selected = [variation(600, [{ attribute_id: SIZE_ATTR, term_id: 21 }])];
        const result = applyPattern("{product}-{color}-{size}", "ACME", selected, TOKENS, TERM_NAMES);
        expect(result.skuByVariationId[600]).toBe("ACME-M");
    });

    it("leaves unknown tokens (typos) untouched so the operator notices", () => {
        const selected = [variation(700, [{ attribute_id: COLOR_ATTR, term_id: 10 }])];
        const result = applyPattern("{product}-{colour}", "ACME", selected, TOKENS, TERM_NAMES);
        expect(result.skuByVariationId[700]).toBe("ACME-{colour}");
    });
});
