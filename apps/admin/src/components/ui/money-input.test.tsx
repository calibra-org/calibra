import { describe, expect, it } from "vitest";

import { rialToToman, tomanToRial } from "#/lib/money";

describe("Toman ↔ Rial round-trip", () => {
    it("89,000 Toman = 890,000 Rial", () => {
        expect(tomanToRial(89000)).toBe(890000);
    });

    it("major fractions round to the nearest Rial", () => {
        expect(tomanToRial(123.49)).toBe(1235);
        expect(tomanToRial(123.45)).toBe(1235);
        expect(tomanToRial(0.1)).toBe(1);
    });

    it("minor → major drops the trailing zero", () => {
        expect(rialToToman(890000)).toBe(89000);
        expect(rialToToman(1)).toBe(0.1);
    });

    it("null in → null out", () => {
        expect(rialToToman(null)).toBeNull();
    });

    it("round-trip is lossless on integer Toman values", () => {
        for (const major of [0, 1, 12, 89000, 100000000]) {
            expect(rialToToman(tomanToRial(major))).toBe(major);
        }
    });
});
