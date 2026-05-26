import { createHash } from "node:crypto";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import ProcessedWebhookEvent from "#models/processed_webhook_event";

export interface WebhookEventInput {
    provider: string;
    eventId: string;
    eventKind: string;
    paymentAttemptId?: number | bigint | null;
    orderId?: number | bigint | null;
    rawBody: string;
}

export interface WebhookEventReplay {
    replayed: true;
    existing: ProcessedWebhookEvent;
}

export interface WebhookEventInserted {
    replayed: false;
    inserted: ProcessedWebhookEvent;
}

export type RecordOutcome = WebhookEventInserted | WebhookEventReplay;

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Idempotency ledger for inbound PSP callbacks. The webhook handler calls `record()` inside
 * the same transaction as the work it's about to do — a duplicate `(provider, event_id)`
 * raises a unique-violation in Postgres, which we translate into `{ replayed: true }` so the
 * caller can short-circuit and serve the prior outcome.
 *
 * The payload hash gives audit a way to spot tampering across replays (same id, different
 * body → the second arrival was forged or the PSP changed its serialisation mid-flight).
 *
 * `outcome` is updated by the caller after the side effects complete so the ledger reflects
 * what actually happened to each event (success / failed / cancelled / mismatch / refunded).
 */
export class WebhookIdempotencyService {
    async record(
        input: WebhookEventInput,
        trx?: TransactionClientContract,
    ): Promise<RecordOutcome> {
        const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
        const row = new ProcessedWebhookEvent();
        if (trx) row.useTransaction(trx);
        row.provider = input.provider;
        row.eventId = input.eventId;
        row.eventKind = input.eventKind;
        row.payloadHash = payloadHash;
        row.outcome = "pending";
        row.receivedAt = DateTime.utc();
        if (input.paymentAttemptId !== undefined && input.paymentAttemptId !== null) {
            row.paymentAttemptId = Number(input.paymentAttemptId);
        }
        if (input.orderId !== undefined && input.orderId !== null) {
            row.orderId = Number(input.orderId);
        }
        try {
            await row.save();
            return { replayed: false, inserted: row };
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                const existing = await ProcessedWebhookEvent.query({ client: trx })
                    .where("provider", input.provider)
                    .where("event_id", input.eventId)
                    .firstOrFail();
                return { replayed: true, existing };
            }
            throw error;
        }
    }

    /**
     * Mark an inserted event row as processed with a terminal outcome. The caller passes
     * whichever transaction it owns; the ledger update happens inside it so a transactional
     * rollback also rolls back this status flip.
     */
    async finalize(
        row: ProcessedWebhookEvent,
        outcome: string,
        opts: { trx?: TransactionClientContract; paymentAttemptId?: number | bigint | null; orderId?: number | bigint | null } = {},
    ): Promise<void> {
        if (opts.trx) row.useTransaction(opts.trx);
        row.outcome = outcome;
        row.processedAt = DateTime.utc();
        if (opts.paymentAttemptId !== undefined && opts.paymentAttemptId !== null) {
            row.paymentAttemptId = Number(opts.paymentAttemptId);
        }
        if (opts.orderId !== undefined && opts.orderId !== null) {
            row.orderId = Number(opts.orderId);
        }
        await row.save();
    }

    private isUniqueViolation(error: unknown): boolean {
        const code = (error as { code?: string } | null)?.code;
        return code === POSTGRES_UNIQUE_VIOLATION;
    }
}

export const webhookIdempotencyService = new WebhookIdempotencyService();
