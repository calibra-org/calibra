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
    /** Replies stored client-side until the API exposes a reply field. */
    replies?: Record<number, { body: string; updatedAt: string } | undefined>;
}

/**
 * SDK `AdminReview` → admin view `AdminReview`. Status maps 1:1 — the API and the view share the
 * same four moderation states (`pending` / `approved` / `spam` / `trash`).
 */
export function toAdminReview(r: SdkAdminReview, ctx: AdapterContext = {}): AdminReview {
    const status: ReviewStatus = r.status;
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
