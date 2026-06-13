import crypto from "node:crypto";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import env from "#start/env";

/** Operator handoff links live as long as a self-service reset — 60 minutes, single use. */
const HANDOFF_TTL_MINUTES = 60;

export interface HandoffResult {
    /** The single-use link the operator visits to set their own password. Reveal-once. */
    url: string;
    expires_at: string;
}

/**
 * The admin base URL for a tenant, derived from `ADMIN_URL_TEMPLATE` + the tenant **slug** — NEVER a
 * custom domain. A handoff/impersonation link must land on a host the platform controls so an
 * operator credential is never deposited on a customer-controlled custom hostname (R-leak guard).
 */
export function adminBaseForSlug(slug: string): string {
    const template = env.get("ADMIN_URL_TEMPLATE") ?? "https://{slug}.admin.calibra.app";
    return template.replace("{slug}", slug).replace(/\/$/, "");
}

/**
 * Create an operator-handoff password-reset token and return the single-use link. The token is the
 * same shape (64-hex) the self-service forgot flow uses, so it is consumed by the existing
 * `password_reset_controller` (which clears `must_change_password` on consume). Written with an
 * explicit `tenant_id` + `created_by_platform_user_id` on the caller's transaction — the
 * `postgres_admin` trx for the platform path, or the request trx for the admin self-service path.
 *
 * Reveal-once: only the link is returned; the hash is stored. A second use fails (the consume path
 * stamps `used_at`).
 */
export async function createOperatorHandoffLink(
    trx: TransactionClientContract,
    opts: { userId: bigint | number; tenantId: bigint | number; slug: string; createdByPlatformUserId?: bigint | number | null },
): Promise<HandoffResult> {
    const tokenPlain = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");
    const now = DateTime.utc();
    const expiresAt = now.plus({ minutes: HANDOFF_TTL_MINUTES });

    await trx.table("password_reset_tokens").insert({
        user_id: Number(opts.userId),
        tenant_id: Number(opts.tenantId),
        token_hash: tokenHash,
        kind: "operator_handoff",
        created_by_platform_user_id:
            opts.createdByPlatformUserId === undefined || opts.createdByPlatformUserId === null
                ? null
                : Number(opts.createdByPlatformUserId),
        expires_at: expiresAt.toSQL(),
        created_at: now.toSQL(),
        updated_at: now.toSQL(),
    });

    return {
        url: `${adminBaseForSlug(opts.slug)}/set-password?token=${tokenPlain}`,
        expires_at: expiresAt.toISO()!,
    };
}
