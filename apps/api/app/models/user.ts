import type { AccessToken } from "@adonisjs/auth/access_tokens";
import { DbAccessTokensProvider } from "@adonisjs/auth/access_tokens";
import { withAuthFinder } from "@adonisjs/auth/mixins/lucid";
import { compose } from "@adonisjs/core/helpers";
import hash from "@adonisjs/core/services/hash";
import { beforeSave, hasOne } from "@adonisjs/lucid/orm";
import type { HasOne } from "@adonisjs/lucid/types/relations";

import { UserSchema } from "#database/schema";
import { TenantScoped } from "#models/concerns/tenant_scoped";
import Customer from "#models/customer";

/**
 * `withAuthFinder` adds three things to the model: a `beforeSave` hook that hashes the password
 * column whenever it's dirty, a `findForAuth(uids, value)` lookup helper, and
 * `verifyCredentials(uid, password)` with built-in timing-attack protection. Email lookups are
 * case-insensitive at the column level (citext), so the mixin's exact-match search still does the
 * right thing for `Test@Foo.Com` vs `test@foo.com`.
 */
const AuthFinder = withAuthFinder(() => hash.use("scrypt"), {
    uids: ["email"],
    passwordColumnName: "passwordHash",
});

export default class User extends compose(UserSchema, AuthFinder, TenantScoped) {
    static table = "users";

    /**
     * Populated by the access tokens guard on successful authentication. Declaring it here keeps
     * `user.currentAccessToken` typed in controllers and transformers.
     */
    declare currentAccessToken?: AccessToken;

    @hasOne(() => Customer, { foreignKey: "userId" })
    declare customer: HasOne<typeof Customer>;

    /**
     * 30-day default lifetime — matches the storefront's session expectation. Issuing code can
     * override per call (`User.accessTokens.create(user, [], { expiresIn })`) when a short-lived
     * token is needed (e.g. an admin impersonation).
     */
    static accessTokens = DbAccessTokensProvider.forModel(User, {
        expiresIn: "30 days",
        prefix: "oat_",
        table: "auth_access_tokens",
        type: "auth_token",
        tokenSecretLength: 40,
    });

    /**
     * Normalise the email to lowercase before every save. The `citext` column type also
     * does case-insensitive lookups, but stamping a canonical form on write keeps the
     * audit log + welcome-email render free of mixed-case eyesores like `Foo@Bar.Com`.
     */
    @beforeSave()
    static lowercaseEmail(user: User) {
        if (user.$dirty.email !== undefined && typeof user.email === "string") {
            user.email = user.email.toLowerCase();
        }
    }
}
