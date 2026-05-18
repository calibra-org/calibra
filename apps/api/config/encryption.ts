import { defineConfig, drivers } from "@adonisjs/core/encryption";

import env from "#start/env";

/**
 * Encryption configuration. ChaCha20-Poly1305 is the recommended modern AEAD driver — fast on
 * all platforms (including hardware without AES-NI) and used by TLS 1.3.
 *
 * @see https://docs.adonisjs.com/guides/security/encryption
 */
export default defineConfig({
    default: "chacha",
    list: {
        chacha: drivers.chacha20({
            id: "chacha",
            keys: [env.get("APP_KEY")],
        }),
    },
});
