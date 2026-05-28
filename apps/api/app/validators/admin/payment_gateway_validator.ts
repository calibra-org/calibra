import vine from "@vinejs/vine";

import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import { adminPaymentGatewaysView } from "#table_views/admin/payment_gateways";

/**
 * Admin `GET /api/v1/admin/payment-gateways` list query. TableView grammar; default page size
 * is 100 (the table holds < 10 rows by convention, but uniform grammar wins over a
 * single-page-only carve-out). Strict mode: legacy `?enabled=true` is no longer accepted —
 * use `?filter[]=enabled:eq:true` instead.
 */
export const adminPaymentGatewayListValidator = adminPaymentGatewaysView.compileStrict({ defaultLimit: 100 });

/**
 * Admin `PATCH /api/v1/admin/payment-gateways/:id`. `settings` is a free-form object; the
 * controller merges (rather than replaces) the incoming object so admins can rotate one key at a
 * time without re-sending the full dictionary.
 */
export const adminPaymentGatewayUpdateValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
        ordering: vine.number().min(0).optional(),
        settings: vine.record(vine.any()).optional(),
        supports: vine.record(vine.any()).optional(),
    }),
);

/**
 * All filters move to the TableView `filter[]` grammar via {@link adminPaymentAttemptsView}.
 * Strict mode: any non-TableView query key returns 422.
 */
export const adminPaymentAttemptListValidator = adminPaymentAttemptsView.compileStrict();
