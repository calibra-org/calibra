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

/**
 * SDK `AdminReview` → admin view `AdminReview`. The API and view models use slightly different
 * status names: API uses `rejected`, the view uses `spam` (kept for compatibility with the WC
 * vocabulary the operator UI was built against).
 */
export function toAdminReview(r: SdkAdminReview): AdminReview {
    const status: ReviewStatus = r.status === "rejected" ? "spam" : r.status === "approved" ? "approved" : "pending";
    return {
        id: r.id,
        productId: r.product_id,
        productName: dup(""),
        reviewerName: r.reviewer_name,
        reviewerEmail: r.reviewer_email ?? "",
        rating: clampRating(r.rating),
        body: r.body,
        status,
        verified: Boolean(r.verified),
        createdAt: r.created_at ?? new Date().toISOString(),
    };
}
