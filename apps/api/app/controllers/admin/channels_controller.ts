import { randomBytes } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import { BusinessRuleException, ResourceNotFoundException } from "#exceptions/domain_exceptions";
import ChannelConnection from "#models/channel_connection";
import { recordAudit } from "#services/admin_audit_log_service";
import { channelAdapterRegistry } from "#services/channels/channel_adapter_registry";
import { open, seal } from "#services/channels/channel_credential_store";
import { resolveShopAgent } from "#services/ticketing/support_actor";
import ChannelConnectionTransformer from "#transformers/channel_connection_transformer";

/** Per-provider keys that are non-secret (stored in `public_config`); everything else is sealed. */
const PUBLIC_KEYS: Record<string, string[]> = {
    whatsapp: ["phone_number_id", "waba_id"],
    telegram: ["bot_username"],
};

/**
 * External-channel connect surface (`/api/v1/admin/channels/:provider/...`). Phase-2 functionality
 * built as a seam in v1: credentials are stored (sealed) and verifiable, but ACTIVATING a
 * whatsapp/telegram inbox stays gated (R6) — there is no reachable relay yet. support_admin only.
 */
export default class ChannelsController {
    /** POST /:provider/connect — validate + seal credentials, return the masked connection. */
    async connect(ctx: HttpContext) {
        const actor = await this.requireAdmin(ctx);
        const provider = this.resolveProvider(ctx);
        const adapter = channelAdapterRegistry.get(provider);
        const creds = (await vine.compile(adapter.fieldsSchema()).validate(ctx.request.body())) as Record<string, unknown>;

        const publicKeys = PUBLIC_KEYS[provider] ?? [];
        const publicConfig: Record<string, unknown> = {};
        const secrets: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(creds)) {
            if (publicKeys.includes(key)) {
                publicConfig[key] = value;
            } else {
                secrets[key] = value;
            }
        }

        const connection = new ChannelConnection();
        connection.provider = provider;
        connection.endpointId = randomBytes(16).toString("hex");
        connection.status = "pending";
        connection.publicConfig = publicConfig;
        connection.keyVersion = 1;
        await connection.save();
        await seal(Number(connection.id), secrets, connection.keyVersion);

        await recordAudit({
            ctx,
            actorUserId: actor.userId,
            action: "channel.connect",
            entityKind: "channel_connection",
            entityId: Number(connection.id),
            payload: { provider },
        });

        ctx.response.status(201);
        return { data: new ChannelConnectionTransformer(connection).toObject() };
    }

    /** POST /:provider/:id/verify — run the adapter's connection probe, persist the outcome. */
    async verify(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const provider = this.resolveProvider(ctx);
        const connection = await this.load(ctx.params.id, provider);
        const adapter = channelAdapterRegistry.get(provider);
        const secrets = (await open(Number(connection.id))) ?? {};

        const result = await adapter.verifyConnection({ secrets, publicConfig: connection.publicConfig ?? {} });
        connection.status = result.ok ? "connected" : "error";
        connection.lastError = result.ok ? null : (result.error ?? "verify_failed");
        if (result.ok) {
            connection.lastVerifiedAt = DateTime.utc();
        }
        await connection.save();
        return { data: new ChannelConnectionTransformer(connection).toObject() };
    }

    /** POST /:provider/:id/disconnect — drop the connection (cascades the sealed secret). */
    async disconnect(ctx: HttpContext) {
        const actor = await this.requireAdmin(ctx);
        const provider = this.resolveProvider(ctx);
        const connection = await this.load(ctx.params.id, provider);
        await connection.delete();
        await recordAudit({
            ctx,
            actorUserId: actor.userId,
            action: "channel.disconnect",
            entityKind: "channel_connection",
            entityId: Number(connection.id),
            payload: { provider },
        });
        return ctx.response.noContent();
    }

    private async requireAdmin(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        if (actor.supportRole !== "support_admin") {
            throw new BusinessRuleException("Support admin access required", "ticketing.support_admin.required");
        }
        return actor;
    }

    private resolveProvider(ctx: HttpContext): string {
        const provider = String(ctx.params.provider);
        if (!PUBLIC_KEYS[provider]) {
            throw new ResourceNotFoundException("Unknown channel provider");
        }
        return provider;
    }

    private async load(id: unknown, provider: string): Promise<ChannelConnection> {
        const connection = await ChannelConnection.query().where("id", Number(id)).where("provider", provider).first();
        if (!connection) {
            throw new ResourceNotFoundException("Channel connection not found");
        }
        return connection;
    }
}
