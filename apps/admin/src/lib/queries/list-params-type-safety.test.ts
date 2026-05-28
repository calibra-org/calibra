import { describe, expect, test } from "vitest";

import type { ProductsListParams } from "#/lib/products/queries";
import type { CouponsListParams } from "#/lib/queries/coupons";
import type { CustomersListParams } from "#/lib/queries/customers";
import type { OrdersListParams } from "#/lib/queries/orders";
import type { ReviewsListParams } from "#/lib/reviews/queries";

/**
 * Compile-time contract for the list-query hooks: a correct query typechecks, a wrong one is a TS
 * error you see immediately. These are NOT runtime assertions — the `@ts-expect-error` directives
 * are validated by `tsc --noEmit` (the `typecheck` script includes `src/**\/*.test.ts`). If a params
 * interface ever loosens (e.g. gains an index signature, or a renamed key reappears), the directive
 * stops firing and `tsc` fails on the unused directive. This is the structural guard that makes the
 * PR #49 key-rename class (`search` vs `q`, scalar `sort`, camelCase extras) impossible to reintroduce.
 */
describe("list-query params type safety", () => {
    test("orders: valid extras typecheck; typos and wrong value types do not", () => {
        const ok: OrdersListParams = { q: "shoes", trashed: true };
        // @ts-expect-error `trashd` is not a declared extra
        const typo: OrdersListParams = { q: "shoes", trashd: true };
        // @ts-expect-error `trashed` is a boolean, not a string
        const wrongType: OrdersListParams = { trashed: "yes" };
        // @ts-expect-error `search` is the legacy key — it must be `q`
        const legacy: OrdersListParams = { search: "shoes" };
        expect([ok, typo, wrongType, legacy]).toHaveLength(4);
    });

    test("customers: extras are wire-keyed (snake_case), not the old camelCase", () => {
        const ok: CustomersListParams = { q: "ali", include_stats: true, last_order_after: "2026-01-01" };
        // @ts-expect-error `includeStats` was renamed to the wire key `include_stats`
        const camel: CustomersListParams = { includeStats: true };
        // @ts-expect-error `include_stats` is a boolean
        const wrongType: CustomersListParams = { include_stats: "true" };
        expect([ok, camel, wrongType]).toHaveLength(3);
    });

    test("coupons: only the declared extras are accepted", () => {
        const ok: CouponsListParams = { q: "WELCOME", tab: "active", expiring_soon: true };
        // @ts-expect-error discount_type rides filter[], it is not a top-level extra
        const notAnExtra: CouponsListParams = { discount_type: "percent" };
        // @ts-expect-error `search` is the legacy key — it must be `q`
        const legacy: CouponsListParams = { search: "WELCOME" };
        expect([ok, notAnExtra, legacy]).toHaveLength(3);
    });

    test("products: extras are wire-keyed; columns ride filter[] not params", () => {
        const ok: ProductsListParams = { q: "x", status: "publish", stock_status: "instock", on_sale: true };
        // @ts-expect-error `stockStatus` was renamed to the wire key `stock_status`
        const camel: ProductsListParams = { stockStatus: "instock" };
        // @ts-expect-error `featured` is a filter[] column, not a top-level param
        const column: ProductsListParams = { featured: true };
        expect([ok, camel, column]).toHaveLength(3);
    });

    test("reviews: only query + client-only search/tab; facets ride filter[]", () => {
        const ok: ReviewsListParams = { search: "great", tab: "spam" };
        // @ts-expect-error `rating` rides filter[], it is not a params field
        const facet: ReviewsListParams = { rating: 5 };
        // @ts-expect-error `tab` is a status string, not a number
        const wrongType: ReviewsListParams = { tab: 5 };
        expect([ok, facet, wrongType]).toHaveLength(3);
    });
});
