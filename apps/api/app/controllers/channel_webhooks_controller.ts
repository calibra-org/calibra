import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import ProcessInboundMessageJob from "#jobs/process_inbound_message_job";
import { channelAdapterRegistry } from "#services/channels/channel_adapter_registry";

/**
 * Inbound channel webhook entrypoint (R3). Runs AFTER `ChannelWebhookMiddleware` has resolved the
 * tenant from the `endpointId` and verified the signature. This controller:
 *
 *  1. Normalizes just enough to extract the provider event id.
 *  2. Dedups on the TENANT-SCOPED `ticketing_inbound_events` ledger (`INSERT … ON CONFLICT DO
 *     NOTHING`) on `postgres_admin` with an explicit `tenant_id` — NOT the PSP `processed_webhook_events`
 *     (R3). A replay short-circuits to 200 without enqueuing.
 *  3. Enqueues `ProcessInboundMessageJob` with the explicit `tenantId`, then returns 200 immediately.
 *
 * The heavy lifting (identity upsert, conversation, message, broadcast) is the job's, off the
 * request path.
 */
export default class ChannelWebhooksController {
    async handle(ctx: HttpContext) {
        const webhook = ctx.channelWebhook;
        if (!webhook) {
            return ctx.response.unauthorized({ errors: [{ message: "Unverified webhook", code: "E_UNVERIFIED" }] });
        }

        const payload = ctx.request.body();
        const adapter = channelAdapterRegistry.get(webhook.provider);
        const canonical = adapter.normalizeInbound(payload);

        const inserted = await db
            .connection("postgres_admin")
            .table("ticketing_inbound_events")
            .insert({
                tenant_id: webhook.tenantId,
                provider: webhook.provider,
                external_event_id: canonical.externalEventId,
                outcome: "received",
                received_at: new Date(),
            })
            .onConflict(["tenant_id", "provider", "external_event_id"])
            .ignore()
            .returning("id");

        if (inserted.length === 0) {
            return ctx.response.ok({ status: "duplicate" });
        }

        await ProcessInboundMessageJob.dispatch({
            tenantId: webhook.tenantId,
            connectionId: webhook.connectionId,
            provider: webhook.provider,
            rawPayload: payload,
        });

        return ctx.response.ok({ status: "accepted" });
    }
}
