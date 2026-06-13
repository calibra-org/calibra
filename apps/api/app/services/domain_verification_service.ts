import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";

/**
 * DNS-based custom-domain verification for the Control Plane v2 edge. Three independent checks gate a
 * custom domain before it routes or issues TLS (the R5 predicate); each returns a discriminated
 * result so the caller (`domains_controller.recheck`) can persist `cert_last_error` on failure and
 * badge a simulated pass in the UI.
 *
 * **Local simulation** — under `SPIN_SIMULATE_DNS=1` every check short-circuits to a simulated pass.
 * This is how a `.localhost` custom domain (e.g. `acme-boutique.store.localhost`) verifies on a spin
 * where the operator cannot publish real DNS records; the flags it flips are the SAME flags real DNS
 * verification flips, through the SAME writer — there is no divergent local code path. The flag is
 * read from `process.env` (not the validated env module) so a Japa test can toggle it per case.
 *
 * Never uses `Math.random` — the only randomness is the CSPRNG ownership token.
 */

export interface VerificationResult {
    ok: boolean;
    /** True when the result came from the local DNS simulation rather than a real lookup. */
    simulated: boolean;
    /** Human-readable failure cause, persisted to `cert_last_error` when `ok` is false. */
    reason?: string;
}

/** ACME issuers the platform's edge can use; a domain's CAA must permit at least one (or have none). */
const ALLOWED_CAA_ISSUERS = ["letsencrypt.org", "sectigo.com", "pki.goog"] as const;

/** Crockford-free RFC 4648 base32 alphabet, lowercased — url-safe and free of ambiguous glyphs. */
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Local/spin DNS simulation toggle. Read from `process.env` so tests can flip it per case. */
export function dnsSimulated(): boolean {
    return process.env.SPIN_SIMULATE_DNS === "1";
}

/** Lowercase RFC 4648 base32 (no padding) of arbitrary bytes. */
function base32(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return out;
}

/** Strip a trailing dot and lowercase a DNS name for comparison. */
function normaliseName(name: string): string {
    return name.replace(/\.$/, "").toLowerCase();
}

/** The DNS error code (`ENOTFOUND`, `ENODATA`, …) for an error, for `cert_last_error`. */
function dnsErrorCode(error: unknown): string {
    return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "DNS_ERROR";
}

/** A fresh, url-safe per-domain TXT verification value. Regenerated on every (re-)insert. */
export function generateOwnershipToken(): string {
    return `calibra-verify-${base32(randomBytes(20))}`;
}

/** The TXT record name the operator must create to prove ownership of `domain`. */
export function ownershipRecordName(domain: string): string {
    return `_calibra-verify.${domain}`;
}

/**
 * Ownership: a `TXT` record at `_calibra-verify.<domain>` whose flattened value contains the issued
 * `token`. Simulated → pass.
 */
export async function verifyOwnership(domain: string, token: string): Promise<VerificationResult> {
    if (dnsSimulated()) return { ok: true, simulated: true };
    try {
        const records = await dns.resolveTxt(ownershipRecordName(domain));
        const flat = records.map((chunks) => chunks.join("")).join(" ");
        const ok = flat.includes(token);
        return { ok, simulated: false, reason: ok ? undefined : "Verification TXT record not found at _calibra-verify" };
    } catch (error) {
        return { ok: false, simulated: false, reason: `Ownership DNS lookup failed (${dnsErrorCode(error)})` };
    }
}

/**
 * Routing: a `CNAME` from `domain` to `target`, or — for an apex domain that cannot CNAME — an
 * `A` record pointing at `EDGE_APEX_IP`. Simulated → pass.
 */
export async function verifyRouting(domain: string, target: string): Promise<VerificationResult> {
    if (dnsSimulated()) return { ok: true, simulated: true };
    const wanted = normaliseName(target);
    try {
        const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
        if (cnames.some((c) => normaliseName(c) === wanted)) {
            return { ok: true, simulated: false };
        }
        const apexIp = process.env.EDGE_APEX_IP;
        if (apexIp) {
            const a = await dns.resolve4(domain).catch(() => [] as string[]);
            if (a.includes(apexIp)) return { ok: true, simulated: false };
        }
        return { ok: false, simulated: false, reason: `Domain does not route to the edge (expected CNAME ${wanted})` };
    } catch (error) {
        return { ok: false, simulated: false, reason: `Routing DNS lookup failed (${dnsErrorCode(error)})` };
    }
}

/**
 * CAA preflight: issuance is allowed when the domain publishes no `CAA` record, or its `CAA`
 * `issue`/`issuewild` tags permit one of {@link ALLOWED_CAA_ISSUERS}. A `CAA` that names only other
 * CAs is a hard pre-failure (ACME would reject), surfaced as `failed`. Simulated → pass.
 */
export async function preflightCaa(domain: string): Promise<VerificationResult> {
    if (dnsSimulated()) return { ok: true, simulated: true };
    try {
        const records = await dns.resolveCaa(domain).catch(() => [] as Array<{ issue?: string; issuewild?: string }>);
        const issuers = records
            .map((r) => (r.issue ?? r.issuewild ?? "").toLowerCase().trim())
            .filter((issuer) => issuer.length > 0);
        if (issuers.length === 0) return { ok: true, simulated: false };
        const ok = issuers.some((issuer) => ALLOWED_CAA_ISSUERS.some((allowed) => issuer.includes(allowed)));
        return { ok, simulated: false, reason: ok ? undefined : `CAA forbids our certificate authority (${issuers.join(", ")})` };
    } catch (error) {
        return { ok: false, simulated: false, reason: `CAA DNS lookup failed (${dnsErrorCode(error)})` };
    }
}
