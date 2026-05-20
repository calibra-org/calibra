import { z } from "zod";

/**
 * Zod schema for the Quick Edit form. Field names mirror the React Hook Form value shape; values
 * convert into the `QuickEditPayload` consumed by `useQuickEditProduct`. Money is stored as Rial
 * (minor units) because the API expects minor units; the form binds a Toman-major value and the
 * `quick-edit-form` does the *10 conversion before submit.
 *
 * Every field is required at the React Hook Form layer (the default values supplied at form
 * construction guarantee they're populated), so we keep the schema explicit instead of leaning
 * on `.default()` — which would diverge input vs. output types and confuse the zodResolver.
 */
export const quickEditSchema = z.object({
    name: z.string().min(1, { message: "errors.nameRequired" }).max(200),
    slug: z.string().min(1, { message: "errors.slugRequired" }).max(200),
    shortDescription: z.string().max(2000),
    status: z.enum(["draft", "publish", "pending", "private"]),
    sku: z.string().max(120),
    regularPriceMajor: z.number({ message: "errors.numberRequired" }).min(0),
    salePriceMajor: z.number().min(0).nullable(),
    manageStock: z.boolean(),
    stockQuantity: z.number().int().min(0).nullable(),
    stockStatus: z.enum(["instock", "outofstock", "onbackorder"]),
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
