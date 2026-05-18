import { defineConfig } from "@adonisjs/auth";
import { tokensGuard, tokensUserProvider } from "@adonisjs/auth/access_tokens";
import type { InferAuthenticators, InferAuthEvents, Authenticators } from "@adonisjs/auth/types";

/**
 * Auth configuration. A single `api` guard backed by opaque `access_tokens` covers both the
 * storefront and admin clients; tokens are minted on `POST /api/v1/auth/login` and carried as
 * bearer tokens on subsequent requests. Token lifetime is configured per-token via
 * `User.accessTokens.create(user, abilities, { expiresIn })` rather than centrally — see the
 * register/login controllers for the 30-day default.
 */
const authConfig = defineConfig({
    default: "api",
    guards: {
        api: tokensGuard({
            provider: tokensUserProvider({
                tokens: "accessTokens",
                model: () => import("#models/user"),
            }),
        }),
    },
});

export default authConfig;

declare module "@adonisjs/auth/types" {
    export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module "@adonisjs/core/types" {
    interface EventsList extends InferAuthEvents<Authenticators> {}
}
