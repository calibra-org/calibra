import { describe, expect, it } from "vitest";

import { formatIdList, parseIdList, quickEditSchema } from "./quick-edit-schema";

describe("parseIdList / formatIdList", () => {
    it("returns [] for an empty string", () => {
        expect(parseIdList("")).toEqual([]);
    });

    it("parses a comma list with stray whitespace", () => {
        expect(parseIdList(" 1, 2,3 ,4  ")).toEqual([1, 2, 3, 4]);
    });

    it("drops non-numeric and zero entries", () => {
        expect(parseIdList("1,abc,0,5")).toEqual([1, 5]);
    });

    it("round-trips through formatIdList", () => {
        expect(parseIdList(formatIdList([10, 20, 30]))).toEqual([10, 20, 30]);
    });
});

describe("quickEditSchema", () => {
    const valid = {
        name: "Pixel 9 Pro",
        slug: "pixel-9-pro",
        shortDescription: "",
        status: "publish" as const,
        catalogVisibility: "visible" as const,
        sku: "PX9P",
        gtin: "",
        regularPriceMinor: 1_999_000,
        salePriceMinor: null,
        saleStartsAt: null,
        saleEndsAt: null,
        manageStock: false,
        stockQuantity: null,
        stockStatus: "instock" as const,
        lowStockThreshold: null,
        backorders: "no" as const,
        featured: false,
        categoryIdsCsv: "",
        tagIdsCsv: "",
        brandId: null,
    };

    it("accepts a fully valid payload", () => {
        expect(quickEditSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects an empty name with the localized message id", () => {
        const result = quickEditSchema.safeParse({ ...valid, name: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.message === "errors.nameRequired")).toBe(true);
        }
    });

    it("rejects a negative price", () => {
        const result = quickEditSchema.safeParse({ ...valid, regularPriceMinor: -1 });
        expect(result.success).toBe(false);
    });

    it("accepts a sale price of null", () => {
        expect(quickEditSchema.safeParse({ ...valid, salePriceMinor: null }).success).toBe(true);
    });
});
