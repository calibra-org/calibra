import encryption from "@adonisjs/core/services/encryption";
import db from "@adonisjs/lucid/services/db";

import { currentTenantId, currentTrx } from "#services/tenant_context";

/**
 * Sealed credential store for external channel connections. Secrets are encrypted with the
 * ChaCha20-Poly1305 AEAD service (`config/encryption.ts`, keyed by `APP_KEY`) and written to
 * `channel_secrets` — NEVER stored plaintext, NEVER returned to a client, NEVER logged (R0, §8).
 *
 * Two read paths exist because the inbound webhook is special (R3): it arrives server-to-server with
 * no Host and no tenant context, is resolved on `postgres_admin` (BYPASSRLS) by `endpoint_id`, and
 * must decrypt the secret BEFORE a tenant transaction is opened. So {@link openOnAdmin} reads on the
 * admin connection by `connection_id` (which uniquely belongs to one tenant), while {@link seal} /
 * {@link open} ride the per-request tenant transaction (RLS-scoped) for the admin connect/verify flow.
 *
 * Multi-key rotation is transparent: `encryption.decrypt` walks every key in `config/encryption.ts`'s
 * `keys[]` array until one succeeds, so a `key_version` bump (new key prepended) still decrypts old
 * ciphertext. The `key_version` column records which key sealed each row for audit + future re-seal.
 *
 * ⛔ The encryption service's `APP_KEY` is the single root for ALL sealed secrets — do not change its
 * handling (key list, driver, id) without a STOP-and-ask: a bad rotation orphans every secret.
 */
const PURPOSE = "channel_secret";

/** Shape of a `channel_connections` row's public (non-secret) view. */
export interface MaskedConnection {
    id: number;
    provider: string;
    provider_variant: string | null;
    endpoint_id: string;
    status: string;
    public_config: Record<string, unknown>;
    key_version: number;
    last_verified_at: string | null;
    last_error: string | null;
}

/**
 * Encrypt `secrets` and persist a new `channel_secrets` row for the connection on the current
 * tenant transaction. Append-only: a re-seal inserts a fresh row (latest wins on read) so an
 * in-flight decrypt of the previous secret never tears.
 */
export async function seal(connectionId: number | bigint, secrets: Record<string, unknown>, keyVersion = 1): Promise<void> {
    const tenantId = currentTenantId();
    const trx = currentTrx();
    const ciphertext = encryption.encrypt(secrets, undefined, PURPOSE);
    await trx.table("channel_secrets").insert({
        tenant_id: String(tenantId),
        connection_id: Number(connectionId),
        ciphertext,
        key_version: keyVersion,
        created_at: new Date(),
    });
}

/**
 * Decrypt the latest secret for a connection within the current tenant transaction (RLS-scoped).
 * Used by the admin connect/verify flow. Returns null when no secret has been sealed yet.
 */
export async function open(connectionId: number | bigint): Promise<Record<string, unknown> | null> {
    const trx = currentTrx();
    const row = await trx.from("channel_secrets").where("connection_id", Number(connectionId)).orderBy("id", "desc").first();
    return decryptRow(row);
}

/**
 * Decrypt the latest secret for a connection on the admin (BYPASSRLS) connection, by
 * `connection_id` alone. ONLY for the inbound webhook seam, which runs before tenant context exists
 * (R3); `connection_id` uniquely identifies one tenant's connection, so this cannot cross tenants.
 */
export async function openOnAdmin(connectionId: number | bigint): Promise<Record<string, unknown> | null> {
    const row = await db
        .connection("postgres_admin")
        .from("channel_secrets")
        .where("connection_id", Number(connectionId))
        .orderBy("id", "desc")
        .first();
    return decryptRow(row);
}

/** Project a connection row to its public, secret-free view. Secrets live in `channel_secrets`, never here. */
export function mask(connection: {
    id: number | bigint;
    provider: string;
    providerVariant?: string | null;
    provider_variant?: string | null;
    endpointId?: string;
    endpoint_id?: string;
    status: string;
    publicConfig?: Record<string, unknown> | null;
    public_config?: Record<string, unknown> | null;
    keyVersion?: number;
    key_version?: number;
    lastVerifiedAt?: string | null;
    last_verified_at?: string | null;
    lastError?: string | null;
    last_error?: string | null;
}): MaskedConnection {
    return {
        id: Number(connection.id),
        provider: connection.provider,
        provider_variant: connection.providerVariant ?? connection.provider_variant ?? null,
        endpoint_id: connection.endpointId ?? connection.endpoint_id ?? "",
        status: connection.status,
        public_config: connection.publicConfig ?? connection.public_config ?? {},
        key_version: connection.keyVersion ?? connection.key_version ?? 1,
        last_verified_at: connection.lastVerifiedAt ?? connection.last_verified_at ?? null,
        last_error: connection.lastError ?? connection.last_error ?? null,
    };
}

/** Decrypt a `channel_secrets` row's ciphertext (multi-key tolerant). Null row / undecodable → null. */
function decryptRow(row: { ciphertext?: string } | null | undefined): Record<string, unknown> | null {
    if (!row || typeof row.ciphertext !== "string") {
        return null;
    }
    return encryption.decrypt<Record<string, unknown>>(row.ciphertext, PURPOSE);
}
