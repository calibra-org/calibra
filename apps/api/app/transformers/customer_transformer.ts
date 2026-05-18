import { BaseTransformer } from "@adonisjs/core/transformers";

import type Customer from "#models/customer";
import CustomerIranProfileTransformer from "#transformers/customer_iran_profile_transformer";

/**
 * Customer transformer. The default shape returns the commerce identity fields; the `withProfileExtensions`
 * variant additionally folds in any present Pattern 3 extensions. Foreign customers naturally land
 * with `profile_extensions: {}`; the iran key is absent (not `null`), which is what the storefront
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
     * Variant emitted by `GET /account/me`. The `profile_extensions` object only carries the keys
     * for extensions the customer actually has a row in — Pattern 3 enforces that absence is the
     * correct signal, never an empty placeholder.
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
