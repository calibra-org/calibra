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
        sku: "PX9P",
        regularPriceMajor: 199_900,
        salePriceMajor: null,
        manageStock: false,
        stockQuantity: null,
        stockStatus: "instock" as const,
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
        const result = quickEditSchema.safeParse({ ...valid, regularPriceMajor: -1 });
        expect(result.success).toBe(false);
    });

    it("accepts a sale price of null", () => {
        expect(quickEditSchema.safeParse({ ...valid, salePriceMajor: null }).success).toBe(true);
    });
});
