import { z } from "zod";

/**
 * Zod schema for the Quick Edit form. Field names mirror the React Hook Form value shape; values
 * convert into the `QuickEditPayload` consumed by `useQuickEditProduct`. Money is stored as
 * MAJOR units (Toman) in the form; the submit handler multiplies × 10 before sending the
 * minor-unit Rial value the API expects.
 */
export const quickEditSchema = z.object({
    name: z.string().min(1, { message: "errors.nameRequired" }).max(200),
    slug: z.string().min(1, { message: "errors.slugRequired" }).max(200),
    shortDescription: z.string().max(2000),
    status: z.enum(["draft", "publish", "pending", "private"]),
    catalogVisibility: z.enum(["visible", "catalog", "search", "hidden"]),
    sku: z.string().max(120),
    gtin: z.string().max(64),
    regularPriceMajor: z.number({ message: "errors.numberRequired" }).min(0),
    salePriceMajor: z.number().min(0).nullable(),
    saleStartsAt: z.string().nullable(),
    saleEndsAt: z.string().nullable(),
    manageStock: z.boolean(),
    stockQuantity: z.number().int().min(0).nullable(),
    stockStatus: z.enum(["instock", "outofstock", "onbackorder"]),
    lowStockThreshold: z.number().int().min(0).nullable(),
    backorders: z.enum(["no", "notify", "yes"]),
    featured: z.boolean(),
    categoryIdsCsv: z.string(),
    tagIdsCsv: z.string(),
    brandId: z.number().int().min(1).nullable(),
});

export type QuickEditValues = z.infer<typeof quickEditSchema>;

/** Comma-separated id list ⇆ number[] helpers. Leaves stray whitespace tolerated. */
export function parseIdList(csv: string): number[] {
    return csv
        .split(",")
        .map((piece) => piece.trim())
        .filter((piece) => piece.length > 0)
        .map((piece) => Number(piece))
        .filter((value) => Number.isFinite(value) && value > 0);
}

export function formatIdList(ids: number[]): string {
    return ids.join(", ");
}
