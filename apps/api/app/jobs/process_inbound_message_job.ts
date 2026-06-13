import { Job } from "@adonisjs/queue";

import TicketingInboundEvent from "#models/ticketing_inbound_event";
import TicketingInbox from "#models/ticketing_inbox";
import { channelAdapterRegistry } from "#services/channels/channel_adapter_registry";
import { recordQueueJobOutcome } from "#services/metrics/domain_metrics";
import { withTenantContext } from "#services/tenant_context";
import { shopContext } from "#services/ticketing/conversation_context";
import { findOrCreateConversation, postMessage } from "#services/ticketing/conversation_service";

/**
 * Processes one verified, deduped inbound channel webhook (R3). The webhook middleware/controller
 * already resolved the tenant from the `endpointId`, verified the signature, and recorded the dedup
 * ledger row — this job carries the tenant EXPLICITLY (no owning row to discover, so
 * `withJobTenantContext` does not apply) and runs its body under {@link withTenantContext} so every
 * write is RLS-scoped to that tenant on `calibra_app`.
 *
 * The adapter only translates; this job owns all DB writes + the transmit broadcast (via
 * `conversation_service`). In v1 the only live producer is the internal channel and the Japa
 * fake-provider test; WhatsApp/Telegram are coded to the seam but gated off. Media download via the
 * adapter is phase-2 — for now an image/file inbound stores the remote url on `content_attributes`.
 */
interface InboundPayload {
    tenantId: string;
    connectionId: number;
    provider: string;
    rawPayload: unknown;
}

export default class ProcessInboundMessageJob extends Job<InboundPayload> {
    static options = {
        queue: "ticketing",
        maxRetries: 2,
        timeout: "2m",
    };

    async execute() {
        const startedAt = process.hrtime.bigint();
        try {
            await withTenantContext(BigInt(this.payload.tenantId), () => this.process());
            recordQueueJobOutcome("ticketing", "completed", Number(process.hrtime.bigint() - startedAt) / 1e9);
        } catch (err) {
            recordQueueJobOutcome("ticketing", "failed", Number(process.hrtime.bigint() - startedAt) / 1e9);
            throw err;
        }
    }

    private async process(): Promise<void> {
        const { provider, connectionId, rawPayload } = this.payload;
        const adapter = channelAdapterRegistry.get(provider);
        const canonical = adapter.normalizeInbound(rawPayload);

        const ctx = shopContext("shop_customer");

        const inbox = await TicketingInbox.query({ client: ctx.trx })
            .where("tenant_id", Number(ctx.tenantId))
            .where("channel_connection_id", connectionId)
            .first();

        if (!inbox) {
            await this.markLedger(provider, canonical.externalEventId, null, "no_inbox");
            return;
        }

        const conversation = await findOrCreateConversation(ctx, {
            inboxId: Number(inbox.id),
            channelIdentity: canonical.channelIdentity,
            displayName: canonical.displayName ?? null,
        });

        await postMessage(ctx, {
            conversationId: Number(conversation.id),
            direction: "inbound",
            author: { kind: "customer", id: null },
            contentType: canonical.contentType,
            body: canonical.body ?? null,
            providerMessageId: canonical.providerMessageId ?? null,
            sourceId: canonical.externalEventId,
            contentAttributes: { raw: canonical.raw, media_url: canonical.mediaUrl ?? null },
        });

        await this.markLedger(provider, canonical.externalEventId, Number(conversation.id), "processed");
    }

    /** Stamp the dedup ledger row with the resulting conversation + outcome (tenant-scoped). */
    private async markLedger(
        provider: string,
        externalEventId: string,
        conversationId: number | null,
        outcome: string,
    ): Promise<void> {
        const ctx = shopContext("shop_customer");
        await TicketingInboundEvent.query({ client: ctx.trx })
            .where("tenant_id", Number(ctx.tenantId))
            .where("provider", provider)
            .where("external_event_id", externalEventId)
            .update({ conversation_id: conversationId, outcome, processed_at: new Date() });
    }
}
