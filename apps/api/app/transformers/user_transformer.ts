import { BaseTransformer } from "@adonisjs/core/transformers";

import type User from "#models/user";

/**
 * User transformer. `password_hash` is never picked, so it cannot leak — that's the whole point of
 * the transformer layer. We expose only the identity, locale, and role fields the storefront /
 * admin care about; auth bookkeeping like `lastLoginAt` is also omitted by default.
 */
export default class UserTransformer extends BaseTransformer<User> {
    toObject() {
        return {
            id: this.resource.id,
            email: this.resource.email,
            locale: this.resource.locale,
            role: this.resource.role,
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }

    /**
     * Admin variant — includes the audit timestamps an operator might want when inspecting an
     * account. Still excludes the password hash.
     */
    forAdmin() {
        return {
            ...this.toObject(),
            last_login_at: this.resource.lastLoginAt?.toISO() ?? null,
            deleted_at: this.resource.deletedAt?.toISO() ?? null,
        };
    }
}
