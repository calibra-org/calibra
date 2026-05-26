import { createHash } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
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
    async record(input: WebhookEventInput, trx?: TransactionClientContract): Promise<RecordOutcome> {
        const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");

        /**
         * `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. When a row with the same
         * (provider, event_id) already exists, Postgres skips the insert and returns zero
         * rows — which is the signal that this is a replay. We can't use a try/catch on the
         * model's save() inside a transaction because a unique-constraint violation aborts
         * the entire transaction (subsequent queries fail with "current transaction is
         * aborted"). ON CONFLICT DO NOTHING returns cleanly without poisoning the txn.
         */
        const client = trx ?? db.connection();
        const paymentAttemptId =
            input.paymentAttemptId !== undefined && input.paymentAttemptId !== null ? Number(input.paymentAttemptId) : null;
        const orderId = input.orderId !== undefined && input.orderId !== null ? Number(input.orderId) : null;
        const insert = await client.rawQuery<{ rows: Array<{ id: string | number }> }>(
            `
            INSERT INTO processed_webhook_events
                (provider, event_id, event_kind, payment_attempt_id, order_id, payload_hash, outcome, received_at, created_at, updated_at)
            VALUES (:provider, :event_id, :event_kind, :payment_attempt_id, :order_id, :payload_hash, 'pending', now(), now(), now())
            ON CONFLICT (provider, event_id) DO NOTHING
            RETURNING id
            `,
            {
                provider: input.provider,
                event_id: input.eventId,
                event_kind: input.eventKind,
                payment_attempt_id: paymentAttemptId as number,
                order_id: orderId as number,
                payload_hash: payloadHash,
            },
        );

        const firstRow = insert.rows[0];
        if (firstRow) {
            const inserted = await ProcessedWebhookEvent.query({ client: trx }).where("id", String(firstRow.id)).firstOrFail();
            return { replayed: false, inserted };
        }

        const existing = await ProcessedWebhookEvent.query({ client: trx })
            .where("provider", input.provider)
            .where("event_id", input.eventId)
            .firstOrFail();
        return { replayed: true, existing };
    }

    /**
     * Mark an inserted event row as processed with a terminal outcome. The caller passes
     * whichever transaction it owns; the ledger update happens inside it so a transactional
     * rollback also rolls back this status flip.
     */
    async finalize(
        row: ProcessedWebhookEvent,
        outcome: string,
        opts: {
            trx?: TransactionClientContract;
            paymentAttemptId?: number | bigint | null;
            orderId?: number | bigint | null;
        } = {},
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
}

export const webhookIdempotencyService = new WebhookIdempotencyService();
