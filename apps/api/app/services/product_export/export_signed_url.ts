import { createHash, timingSafeEqual } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";

/**
 * Signed-URL minter + verifier for the export download endpoint, layered on top of Adonis 7's
 * first-party message verifier (`encryption.getMessageVerifier()`).
 *
 * The verifier (HMAC over APP_KEY, with embedded expiry + purpose) gives us tamper-detection
 * and expiry for free — the entire HMAC/nonce ceremony we used to hand-roll is now one
 * `verifier.sign(payload, ttl, purpose)` call.
 *
 * What we keep on top of the verifier: a `sha256(token)` hash persisted on the row, checked
 * before the verifier even runs. A leaked DB dump should not be sufficient to replay a download
 * URL — the raw token only ever exists in the operator's URL/cookie cache, never in the DB.
 * Without this layer the verifier alone would happily accept any unexpired token an attacker
 * recovered out-of-band.
 *
 * The `expiresAt` on the payload is the DB-side clock the UI uses for "expires in …" hints; the
 * authoritative expiry lives inside the token itself.
 */

const PURPOSE = "export_download";

interface SignedUrlPayload {
    userId: number;
    exportId: number;
    /** Absolute expiry, ms since epoch. Used to derive the verifier's TTL at mint time. */
    expiresAt: number;
}

export interface SignedUrl {
    /** Raw token for the download URL. */
    token: string;
    /** `sha256(token)` — persist on the row for the leaked-dump defense. */
    hash: string;
    expiresAt: number;
}

export function mintSignedUrl(payload: SignedUrlPayload): SignedUrl {
    const ttlSec = Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000));
    const token = encryption.getMessageVerifier().sign({ userId: payload.userId, exportId: payload.exportId }, ttlSec, PURPOSE);
    const hash = createHash("sha256").update(token).digest("hex");
    return { token, hash, expiresAt: payload.expiresAt };
}

export function verifySignedUrl(payload: SignedUrlPayload, token: string, storedHash: string): boolean {
    const incomingHash = createHash("sha256").update(token).digest("hex");
    if (!safeEqual(incomingHash, storedHash)) return false;
    const decoded = encryption.getMessageVerifier().unsign<{ userId: number; exportId: number }>(token, PURPOSE);
    if (decoded === null) return false;
    return Number(decoded.userId) === Number(payload.userId) && Number(decoded.exportId) === Number(payload.exportId);
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
