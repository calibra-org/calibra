import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import Media from "#models/media";

/**
 * Admin media library list view. The bespoke filters stay top-level:
 *   - `type` keyword expands to a MIME group prefix list (`image/*`, `application/pdf` + friends).
 *   - `month` is a `YYYY-MM` calendar filter that resolves to a `>= start AND < end` window.
 *   - `search` does ILIKE across filename / title / alt / url.
 *   - `unattached` / `mine` are existence checks against `product_images` / current user.
 *
 * The view exposes the per-column surface for the operator to fine-tune via `filter[]=`,
 * `sort[]=`, and `limit`. Default cap stays at the higher 200 (media grid loads many tiles).
 */
export const adminMediaView = createTableView({
    model: Media,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        kind: { type: "string", filterable: true, orderable: false },
        mime: { type: "string", filterable: true, orderable: false },
        size_bytes: { type: "bigint", filterable: true, orderable: true },
        width: { type: "number", filterable: true, orderable: false },
        height: { type: "number", filterable: true, orderable: false },
        uploaded_by_user_id: { type: "bigint", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
        filename: { type: "string", filterable: true, orderable: true },
    },
    defaultSort: [
        ["created_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminMediaViewQuery = InferTableViewQuery<typeof adminMediaView>;
