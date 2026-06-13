import { randomInt } from "node:crypto";

/**
 * Generates operator credentials. The temp-password generator is the one place a plaintext operator
 * secret is produced; it is revealed exactly once (provisioning / reset-password) and never logged.
 *
 * The alphabet excludes visually-ambiguous glyphs (`O`/`0`, `I`/`l`/`1`) so an operator can read a
 * revealed password off the screen and type it without ambiguity. Selection uses `crypto.randomInt`
 * (uniform, rejection-sampled internally) — never `Math.random`. Length 16 keeps it strong even
 * though the alphabet is reduced; this is intentionally stronger than the `passwordValidator` policy
 * (which only governs operator-chosen passwords), so a generated credential is never the weak link.
 */
const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 16;

export const CredentialService = {
    /** A fresh 16-char temp password over the ambiguous-glyph-free alphabet. */
    generateTempPassword(): string {
        let out = "";
        for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
            out += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)];
        }
        return out;
    },
} as const;
