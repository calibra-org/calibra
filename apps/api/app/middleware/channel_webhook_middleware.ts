import { createHmac, timingSafeEqual } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";
import db from "@adonisjs/lucid/services/db";

import { openOnAdmin } from "#services/channels/channel_credential_store";

/**
 * Inbound channel webhook verifier (R3). Meta/Telegram POST server-to-server with no Host and no
 * browser context, so neither the Host-based `tenant_context_middleware` (skipped for this path) nor
 * the owning-row `with_job_tenant_context` can resolve them. This middleware:
 *
 *  1. Resolves the `channel_connections` row by the opaque per-tenant `endpointId` on
 *     `postgres_admin` (BYPASSRLS) — the tenant comes from the URL, NEVER the Host.
 *  2. Loads + decrypts the per-tenant DB secret (not an env var) via the credential store.
 *  3. Verifies the provider signature (Meta HMAC `X-Hub-Signature-256` / Telegram
 *     `X-Telegram-Bot-Api-Secret-Token`) in constant time. A bad signature 401s FAST — before the
 *     dedup ledger is ever touched.
 *  4. Hands the verified `{ tenantId, connectionId, provider, rawBody }` to the controller, which
 *     dedups + enqueues.
 *
 * Per-IP rate limiting is applied at the route (`webhookLimiter`).
 */
declare module "@adonisjs/core/http" {
    interface HttpContext {
        /** Set by ChannelWebhookMiddleware after a verified inbound webhook; consumed by the controller. */
        channelWebhook?: {
            tenantId: string;
            connectionId: number;
            provider: string;
        };
    }
}

export default class ChannelWebhookMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const provider = ctx.request.param("provider");
        const endpointId = ctx.request.param("endpointId");

        const connection = (await db
            .connection("postgres_admin")
            .from("channel_connections")
            .where("endpoint_id", endpointId)
            .first()) as { id: number; tenant_id: number | string; provider: string } | undefined;

        if (!connection || connection.provider !== provider) {
            return ctx.response.notFound({ errors: [{ message: "Unknown channel endpoint", code: "E_UNKNOWN_ENDPOINT" }] });
        }

        const secrets = await openOnAdmin(Number(connection.id));
        if (!secrets) {
            return ctx.response.unauthorized({
                errors: [{ message: "Channel secret not configured", code: "E_SIGNATURE_CONFIG_MISSING" }],
            });
        }

        const rawBody = ctx.request.raw() ?? "";
        if (!this.verifySignature(provider, ctx, secrets, rawBody)) {
            return ctx.response.unauthorized({ errors: [{ message: "Bad signature", code: "E_BAD_SIGNATURE" }] });
        }

        ctx.channelWebhook = {
            tenantId: String(connection.tenant_id),
            connectionId: Number(connection.id),
            provider,
        };
        return next();
    }

    /** Verify the provider's signature against the decrypted per-tenant secret, in constant time. */
    private verifySignature(provider: string, ctx: HttpContext, secrets: Record<string, unknown>, rawBody: string): boolean {
        if (provider === "whatsapp") {
            const appSecret = String(secrets.app_secret ?? "");
            const header = ctx.request.header("x-hub-signature-256") ?? "";
            if (!appSecret) {
                return false;
            }
            const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
            return this.constantTimeEqual(header, expected);
        }

        if (provider === "telegram") {
            const expected = String(secrets.webhook_secret ?? "");
            const header = ctx.request.header("x-telegram-bot-api-secret-token") ?? "";
            if (!expected) {
                return false;
            }
            return this.constantTimeEqual(header, expected);
        }

        return false;
    }

    /** Length-guarded `timingSafeEqual` over UTF-8 bytes (false on any length/encoding mismatch). */
    private constantTimeEqual(a: string, b: string): boolean {
        const bufferA = Buffer.from(a, "utf8");
        const bufferB = Buffer.from(b, "utf8");
        if (bufferA.length !== bufferB.length) {
            return false;
        }
        return timingSafeEqual(bufferA, bufferB);
    }
}
