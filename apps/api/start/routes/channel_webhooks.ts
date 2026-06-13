import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { webhookLimiter } from "#start/limiter";

const ChannelWebhooksController = () => import("#controllers/channel_webhooks_controller");

/**
 * Inbound communication-channel webhooks (R3). GLOBAL, tenant-resolved from the URL `:endpointId`
 * (not the Host — this path is on the `tenant_context_middleware` skip-list). `channelWebhook`
 * verifies the per-tenant DB-secret signature (Meta HMAC / Telegram secret-token) and 401s before
 * the dedup ledger; the controller dedups on the tenant-scoped ledger + enqueues. IP-rate-limited.
 *
 * Live in v1 only via the Japa fake-provider test; WhatsApp/Telegram are coded to the seam but
 * gated off at inbox creation (R6).
 */
router
    .group(() => {
        router.post("/:provider/:endpointId", [ChannelWebhooksController, "handle"]).as("webhooks.channels.inbound");
    })
    .prefix("/api/v1/webhooks/channels")
    .use([webhookLimiter, middleware.channelWebhook()]);
