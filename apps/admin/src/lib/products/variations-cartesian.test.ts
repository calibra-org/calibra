import { describe, expect, it } from "vitest";

import { cartesianPins, diffCartesian, pinSetsEqual } from "./variations-cartesian";

describe("cartesianPins", () => {
    it("returns one entry per combination across two axes", () => {
        const result = cartesianPins([
            { attribute_id: 1, term_ids: [10, 11] },
            { attribute_id: 2, term_ids: [20, 21, 22] },
        ]);
        expect(result).toHaveLength(6);
        expect(result[0]).toEqual([
            { attribute_id: 1, term_id: 10 },
            { attribute_id: 2, term_id: 20 },
        ]);
    });

    it("treats null as a real branch alongside explicit terms", () => {
        const result = cartesianPins([
            { attribute_id: 1, term_ids: [10, null] },
            { attribute_id: 2, term_ids: [20] },
        ]);
        expect(result).toEqual([
            [
                { attribute_id: 1, term_id: 10 },
                { attribute_id: 2, term_id: 20 },
            ],
            [
                { attribute_id: 1, term_id: null },
                { attribute_id: 2, term_id: 20 },
            ],
        ]);
    });

    it("returns no combinations when any axis is empty", () => {
        expect(cartesianPins([])).toEqual([]);
        expect(
            cartesianPins([
                { attribute_id: 1, term_ids: [] },
                { attribute_id: 2, term_ids: [20] },
            ]),
        ).toEqual([[{ attribute_id: 2, term_id: 20 }]]);
    });
});

describe("pinSetsEqual", () => {
    it("matches regardless of pin order", () => {
        const a = [
            { attribute_id: 1, term_id: 10 },
            { attribute_id: 2, term_id: 20 },
        ];
        const b = [
            { attribute_id: 2, term_id: 20 },
            { attribute_id: 1, term_id: 10 },
        ];
        expect(pinSetsEqual(a, b)).toBe(true);
    });

    it("treats null === null", () => {
        expect(
            pinSetsEqual([{ attribute_id: 1, term_id: null }], [{ attribute_id: 1, term_id: null }]),
        ).toBe(true);
    });

    it("returns false on differing term ids", () => {
        expect(
            pinSetsEqual([{ attribute_id: 1, term_id: 10 }], [{ attribute_id: 1, term_id: 11 }]),
        ).toBe(false);
    });

    it("returns false on mismatched length", () => {
        expect(
            pinSetsEqual(
                [
                    { attribute_id: 1, term_id: 10 },
                    { attribute_id: 2, term_id: 20 },
                ],
                [{ attribute_id: 1, term_id: 10 }],
            ),
        ).toBe(false);
    });
});

describe("diffCartesian", () => {
    const axes = [
        { attribute_id: 1, term_ids: [10, 11] },
        { attribute_id: 2, term_ids: [20, 21] },
    ];

    it("creates the full cartesian when no existing variations", () => {
        const result = diffCartesian(axes, []);
        expect(result.create).toHaveLength(4);
        expect(result.unchanged).toHaveLength(0);
        expect(result.outdated).toHaveLength(0);
    });

    it("keeps matching variations and creates the rest", () => {
        const existing = [
            {
                id: 1,
                pins: [
                    { attribute_id: 1, term_id: 10 },
                    { attribute_id: 2, term_id: 20 },
                ],
            },
        ];
        const result = diffCartesian(axes, existing);
        expect(result.unchanged.map((v) => v.id)).toEqual([1]);
        expect(result.create).toHaveLength(3);
        expect(result.outdated).toHaveLength(0);
    });

    it("flags outdated variations whose pins aren't in the cartesian", () => {
        const existing = [
            {
                id: 1,
                pins: [
                    { attribute_id: 1, term_id: 10 },
                    { attribute_id: 2, term_id: 99 },
                ],
            },
        ];
        const result = diffCartesian(axes, existing);
        expect(result.outdated.map((v) => v.id)).toEqual([1]);
        expect(result.create).toHaveLength(4);
    });

    it("doesn't double-create when two existing variations share pins (deduped after first match)", () => {
        const existing = [
            { id: 1, pins: [{ attribute_id: 1, term_id: 10 }, { attribute_id: 2, term_id: 20 }] },
            { id: 2, pins: [{ attribute_id: 1, term_id: 10 }, { attribute_id: 2, term_id: 20 }] },
        ];
        const result = diffCartesian(axes, existing);
        expect(result.create).toHaveLength(3);
        expect(result.unchanged.length).toBeGreaterThanOrEqual(1);
    });
});
