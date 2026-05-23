import type { AdminSchemas } from "@calibra/sdk";

import type { AdminReview, LocalizedString, ReviewStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminReview = Schemas["AdminReview"];

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function clampRating(n: number): 1 | 2 | 3 | 4 | 5 {
    return Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

export interface ProductLookupEntry {
    name: LocalizedString;
    slug: LocalizedString;
}

export interface AdapterContext {
    /** Joined product info keyed by product id. Missing entries fall back to `#{id}`. */
    products?: Map<number, ProductLookupEntry>;
    /** Ids the operator soft-deleted via the client-side trash store. */
    trashedIds?: ReadonlySet<number>;
    /** Replies stored client-side until the API exposes a reply field. */
    replies?: Record<number, { body: string; updatedAt: string } | undefined>;
}

/**
 * SDK `AdminReview` → admin view `AdminReview`. The API and view models use slightly different
 * status names: API uses `rejected`, the view uses `spam` (kept for compatibility with the WP
 * vocabulary the operator UI was built against). The view also exposes a `trash` status that
 * lives entirely on the client until soft-delete lands in `apps/api` — see `lib/reviews/trash`.
 */
export function toAdminReview(r: SdkAdminReview, ctx: AdapterContext = {}): AdminReview {
    const baseStatus: ReviewStatus = r.status === "rejected" ? "spam" : r.status === "approved" ? "approved" : "pending";
    const status: ReviewStatus = ctx.trashedIds?.has(r.id) === true ? "trash" : baseStatus;
    const product = ctx.products?.get(r.product_id);
    const reply = ctx.replies?.[r.id];
    return {
        id: r.id,
        productId: r.product_id,
        productName: product?.name ?? dup(""),
        productSlug: product?.slug ?? dup(""),
        reviewerName: r.reviewer_name,
        reviewerEmail: r.reviewer_email ?? "",
        rating: clampRating(r.rating),
        body: r.body,
        status,
        verified: Boolean(r.verified),
        createdAt: r.created_at ?? new Date().toISOString(),
        reply: reply?.body ?? null,
        repliedAt: reply?.updatedAt ?? null,
    };
}
