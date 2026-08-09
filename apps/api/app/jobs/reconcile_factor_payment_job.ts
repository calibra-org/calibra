import { Job } from "@adonisjs/queue";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import { factorDocumentService } from "#services/factor/document_service";

interface ReconcileFactorPaymentPayload {
    orderId: number;
    attemptId: number;
    transactionId: string | null;
}

/**
 * Durable fallback for mirroring a verified online payment into the factor ledger.
 *
 * The synchronous event listener remains the fast path. If it encounters a transient database or
 * process failure, this job retries on the queue worker. `syncVerifiedPayment` is idempotent through
 * the unique payment-attempt ledger index, so replaying this job cannot collect the same payment
 * twice.
 */
export default class ReconcileFactorPaymentJob extends Job<ReconcileFactorPaymentPayload> {
    static options = {
        queue: "payments",
        maxRetries: 5,
        timeout: "2m",
    };

    async execute() {
        await withJobTenantContext("payment_attempts", this.payload.attemptId, async () => {
            await factorDocumentService.syncVerifiedPayment(
                this.payload.orderId,
                this.payload.attemptId,
                this.payload.transactionId,
            );
        });
    }
}
