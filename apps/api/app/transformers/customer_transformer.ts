import { BaseTransformer } from "@adonisjs/core/transformers";

import type Customer from "#models/customer";
import CustomerIranProfileTransformer from "#transformers/customer_iran_profile_transformer";

/**
 * Customer transformer. The default shape returns the commerce identity fields; the
 * `withProfileExtensions` variant additionally folds in any country-scoped extension rows the
 * customer carries (today: `iran` from `customer_iran_profiles`). Foreign customers land with
 * `profile_extensions: {}` and the `iran` key absent — not `null` — which is what the storefront
 * checks via `if ('iran' in profile_extensions)`.
 */
export default class CustomerTransformer extends BaseTransformer<Customer> {
    toObject() {
        return {
            id: this.resource.id,
            user_id: this.resource.userId,
            first_name: this.resource.firstName,
            last_name: this.resource.lastName,
            phone: this.resource.phone,
            country_default: this.resource.countryDefault,
            is_paying_customer: this.resource.isPayingCustomer,
            status: this.resource.status,
            acquisition_channel: this.resource.acquisitionChannel,
            last_seen_at: this.resource.lastSeenAt?.toISO() ?? null,
            attributes: this.resource.attributes ?? {},
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }

    /**
     * Variant emitted by `GET /account/me`. The `profile_extensions` object only carries keys for
     * country-scoped extensions the customer actually has a row in — absence is the correct
     * signal, never an empty placeholder.
     */
    withProfileExtensions() {
        const base = this.toObject();
        const profileExtensions: Record<string, unknown> = {};
        const iran = this.resource.iranProfile;
        if (iran) {
            profileExtensions.iran = new CustomerIranProfileTransformer(iran).toObject();
        }
        return { ...base, profile_extensions: profileExtensions };
    }

    /**
     * Admin list/detail variant. Includes the base shape plus admin-only fields (tags, addresses_count,
     * notes_count) when those relations were preloaded. Stats fields (lifetime_order_count,
     * lifetime_spend_minor, average_order_value_minor, last_order_at, first_order_at) come from a
     * separately-computed `stats` argument so the transformer stays cheap and the controller can
     * batch the aggregate query.
     */
    forAdmin(stats?: AdminStatsRow) {
        const base = this.toObject();
        const tags = Array.isArray(this.resource.tags) ? this.resource.tags.map((t) => t.name) : [];
        const addressesCount = Array.isArray(this.resource.addresses) ? this.resource.addresses.length : null;
        const notesCount = Array.isArray(this.resource.notes) ? this.resource.notes.length : null;
        return {
            ...base,
            tags,
            addresses_count: addressesCount,
            notes_count: notesCount,
            lifetime_order_count: stats?.lifetimeOrderCount ?? 0,
            lifetime_spend_minor: stats?.lifetimeSpendMinor ?? 0,
            average_order_value_minor: stats?.averageOrderValueMinor ?? 0,
            last_order_at: stats?.lastOrderAt ?? null,
            first_order_at: stats?.firstOrderAt ?? null,
            days_since_last_order: stats?.daysSinceLastOrder ?? null,
        };
    }
}

export interface AdminStatsRow {
    lifetimeOrderCount: number;
    lifetimeSpendMinor: number;
    averageOrderValueMinor: number;
    lastOrderAt: string | null;
    firstOrderAt: string | null;
    daysSinceLastOrder: number | null;
}
