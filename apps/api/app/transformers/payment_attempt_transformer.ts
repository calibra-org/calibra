import { BaseTransformer } from "@adonisjs/core/transformers";

import type PaymentAttempt from "#models/payment_attempt";

/**
 * Owns the `/api/v1/admin/payment-attempts/*` response shape. `idempotency_key` is never picked
 * (it's already `serializeAs: null` on the model, but the transformer is the second line of
 * defense). The default `forList` omits `gateway_payload` because PSP responses can be large;
 * `forDetail` includes it for the admin drill-down.
 */
export default class PaymentAttemptTransformer extends BaseTransformer<PaymentAttempt> {
    toObject() {
        return this.forList();
    }

    forList() {
        const attempt = this.resource;
        return {
            id: Number(attempt.id),
            order_id: Number(attempt.orderId),
            gateway_id: Number(attempt.gatewayId),
            gateway_code: attempt.gatewayCodeSnapshot,
            status: attempt.status,
            amount_minor: Number(attempt.amountMinor),
            currency: attempt.currency,
            gateway_authority: attempt.gatewayAuthority,
            gateway_transaction_id: attempt.gatewayTransactionId,
            error_code: attempt.errorCode,
            error_message: attempt.errorMessage,
            initiated_at: attempt.initiatedAt?.toISO() ?? null,
            verified_at: attempt.verifiedAt?.toISO() ?? null,
            created_at: attempt.createdAt?.toISO() ?? null,
        };
    }

    forDetail() {
        const attempt = this.resource;
        return {
            ...this.forList(),
            gateway_payload: (attempt.gatewayPayload as Record<string, unknown>) ?? {},
        };
    }
}
