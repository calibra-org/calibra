import type { AccessToken } from "@adonisjs/auth/access_tokens";
import { DbAccessTokensProvider } from "@adonisjs/auth/access_tokens";
import { withAuthFinder } from "@adonisjs/auth/mixins/lucid";
import { compose } from "@adonisjs/core/helpers";
import hash from "@adonisjs/core/services/hash";
import { beforeSave } from "@adonisjs/lucid/orm";

import { PlatformUserSchema } from "#database/schema";

/**
 * Control-plane operator (the agency). A global identity — NOT tenant-scoped — authenticated through
 * the dedicated `platform` guard against the `platform_access_tokens` table. Can impersonate shop
 * staff (see the platform controllers).
 */
const AuthFinder = withAuthFinder(() => hash.use("scrypt"), {
    uids: ["email"],
    passwordColumnName: "passwordHash",
});

export default class PlatformUser extends compose(PlatformUserSchema, AuthFinder) {
    static table = "platform_users";

    declare currentAccessToken?: AccessToken;

    /**
     * Platform tokens are prefixed `pat_` and live in their own table so the control-plane guard
     * and the per-tenant guard never share a token namespace. 7-day default lifetime.
     */
    static accessTokens = DbAccessTokensProvider.forModel(PlatformUser, {
        expiresIn: "7 days",
        prefix: "pat_",
        table: "platform_access_tokens",
        type: "auth_token",
        tokenSecretLength: 40,
    });

    @beforeSave()
    static lowercaseEmail(user: PlatformUser) {
        if (user.$dirty.email !== undefined && typeof user.email === "string") {
            user.email = user.email.toLowerCase();
        }
    }
}
