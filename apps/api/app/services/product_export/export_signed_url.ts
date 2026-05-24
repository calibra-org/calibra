import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import env from "#start/env";

/**
 * Signed-URL minter + verifier for the export download endpoint.
 *
 * Design:
 *   - The runner generates an HMAC-SHA256 of `user_id|export_id|expires_at` keyed by `APP_KEY`,
 *     stores the digest hash on the row, hands the raw token back to the controller for the
 *     download URL.
 *   - The download endpoint accepts the token via query string, recomputes the HMAC, and
 *     timing-safely compares against the stored hash. Mismatch → 403.
 *   - Tokens expire at the `download_expires_at` column the runner set (24h after completion).
 *     Expired download → 410.
 *
 * Storing only the hash on the DB row means a leaked DB dump can't be used to download files;
 * the raw token only exists in the browser URL + cookie cache the operator owns. The HMAC key
 * is `APP_KEY` (which the app already uses for cookie signing), so leaking it rotates every
 * signed URL.
 *
 * A small random nonce is baked into the token so two exports finishing in the same second can't
 * accidentally collide. The nonce travels in plaintext alongside the HMAC — verifier reads it,
 * re-hashes with it, compares.
 */

interface SignedUrlPayload {
    userId: number;
    exportId: number;
    expiresAt: number;
}

export interface SignedUrl {
    /** Raw token to put in the URL. URL-safe base64; no `/`, `+`, `=`. */
    token: string;
    /** Hex digest of the HMAC. Store this on the DB row. */
    hash: string;
    expiresAt: number;
}

/**
 * Mint a fresh signed token + hash for one export. Returns both; the caller persists `hash` +
 * `expiresAt` on the row and hands `token` to the controller to ship in the download URL.
 */
export function mintSignedUrl(payload: SignedUrlPayload): SignedUrl {
    const nonce = randomBytes(16).toString("base64url");
    const message = buildMessage(payload, nonce);
    const hmac = createHmac("sha256", env.get("APP_KEY")).update(message).digest("hex");
    return {
        token: `${nonce}.${hmac}`,
        hash: hmac,
        expiresAt: payload.expiresAt,
    };
}

/**
 * Verify a token against the stored hash + expiry. Returns `true` only when:
 *  - the token shape is `nonce.hmac`,
 *  - the recomputed HMAC matches both the stored hash AND the token's `hmac` segment (defense
 *    in depth — both should always agree but checking both pins the operator's intent),
 *  - `expiresAt` is in the future.
 *
 * Comparisons are timing-safe so an attacker can't recover the hash byte-by-byte through wall-
 * clock timing of failed requests.
 */
export function verifySignedUrl(payload: SignedUrlPayload, token: string, storedHash: string): boolean {
    if (Date.now() >= payload.expiresAt) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [nonce, providedHmac] = parts as [string, string];
    const message = buildMessage(payload, nonce);
    const expected = createHmac("sha256", env.get("APP_KEY")).update(message).digest("hex");
    return safeEqual(expected, storedHash) && safeEqual(expected, providedHmac);
}

function buildMessage(payload: SignedUrlPayload, nonce: string): string {
    return `${payload.userId}|${payload.exportId}|${payload.expiresAt}|${nonce}`;
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
