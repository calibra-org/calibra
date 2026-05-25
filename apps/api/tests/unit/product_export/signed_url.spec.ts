import { test } from "@japa/runner";

import { mintSignedUrl, verifySignedUrl } from "#services/product_export/export_signed_url";

/**
 * Unit-level guard for the seconds-vs-milliseconds TTL regression. The verifier's `expiresIn`
 * arg is in MILLISECONDS when passed as a number — passing seconds collapses a 24h window
 * into ~86 seconds, which the functional `download with wrong token returns 403` test did
 * not catch (it only exercised the failure path). This test pins the contract by minting a
 * token with a 24h-in-the-future expiry and decoding the embedded `expiryDate`.
 */
test.group("mintSignedUrl TTL contract", () => {
    test("a 24h expiresAt produces a token whose embedded expiryDate is ~24h away", ({ assert }) => {
        const now = Date.now();
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        const signed = mintSignedUrl({ userId: 42, exportId: 7, expiresAt: now + twentyFourHoursMs });

        const [encoded] = signed.token.split(".");
        const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as {
            message: { userId: number; exportId: number };
            purpose: string;
            expiryDate: string;
        };

        assert.equal(payload.purpose, "export_download");
        assert.equal(payload.message.userId, 42);
        assert.equal(payload.message.exportId, 7);

        const ttlMs = new Date(payload.expiryDate).getTime() - now;
        /**
         * Tolerance accounts for clock drift between Date.now() inside mint and our snapshot.
         * Bug-state would land at ~86_000 ms (24h in seconds, mis-treated as ms); the fix
         * lands within a hundred ms of the requested 24h.
         */
        assert.isAbove(ttlMs, twentyFourHoursMs - 2_000);
        assert.isBelow(ttlMs, twentyFourHoursMs + 2_000);
    });

    test("verifySignedUrl accepts a freshly minted token", ({ assert }) => {
        const expiresAt = Date.now() + 60 * 60 * 1000;
        const signed = mintSignedUrl({ userId: 1, exportId: 1, expiresAt });
        const ok = verifySignedUrl({ userId: 1, exportId: 1, expiresAt }, signed.token, signed.hash);
        assert.isTrue(ok);
    });

    test("verifySignedUrl rejects a token whose stored hash differs", ({ assert }) => {
        const expiresAt = Date.now() + 60 * 60 * 1000;
        const signed = mintSignedUrl({ userId: 1, exportId: 1, expiresAt });
        const wrongHash = "0".repeat(signed.hash.length);
        const ok = verifySignedUrl({ userId: 1, exportId: 1, expiresAt }, signed.token, wrongHash);
        assert.isFalse(ok);
    });

    test("verifySignedUrl rejects a token whose payload identifiers don't match the resource", ({ assert }) => {
        const expiresAt = Date.now() + 60 * 60 * 1000;
        const signed = mintSignedUrl({ userId: 1, exportId: 1, expiresAt });
        const ok = verifySignedUrl({ userId: 1, exportId: 999, expiresAt }, signed.token, signed.hash);
        assert.isFalse(ok);
    });
});
