import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { resolvePrice } from "#services/price_resolver";

test.group("price_resolver.resolvePrice", () => {
    test("returns regular price when no sale set", ({ assert }) => {
        const r = resolvePrice({ regularPrice: 1_000_000, salePrice: null, saleStartsAt: null, saleEndsAt: null });
        assert.equal(r.effectivePrice, 1_000_000);
        assert.isFalse(r.onSale);
    });

    test("returns sale price within the sale window", ({ assert }) => {
        const now = DateTime.utc().set({ year: 2026, month: 1, day: 15 });
        const r = resolvePrice(
            {
                regularPrice: 1_000_000,
                salePrice: 800_000,
                saleStartsAt: now.minus({ days: 1 }),
                saleEndsAt: now.plus({ days: 1 }),
            },
            undefined,
            now,
        );
        assert.equal(r.effectivePrice, 800_000);
        assert.isTrue(r.onSale);
    });

    test("falls back to regular price outside the sale window", ({ assert }) => {
        const now = DateTime.utc().set({ year: 2026, month: 1, day: 15 });
        const r = resolvePrice(
            {
                regularPrice: 1_000_000,
                salePrice: 800_000,
                saleStartsAt: now.plus({ days: 1 }),
                saleEndsAt: now.plus({ days: 7 }),
            },
            undefined,
            now,
        );
        assert.equal(r.effectivePrice, 1_000_000);
        assert.isFalse(r.onSale);
    });

    test("variation prices override product prices when set", ({ assert }) => {
        const r = resolvePrice(
            { regularPrice: 1_000_000, salePrice: null, saleStartsAt: null, saleEndsAt: null },
            { regularPrice: 500_000, salePrice: null, saleStartsAt: null, saleEndsAt: null },
        );
        assert.equal(r.effectivePrice, 500_000);
        assert.equal(r.regularPrice, 500_000);
    });
});
