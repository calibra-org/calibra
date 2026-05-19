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
}
