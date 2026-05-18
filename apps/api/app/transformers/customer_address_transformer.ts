import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerAddress from "#models/customer_address";

/**
 * Customer address transformer. Returns the raw stored fields — the storefront looks up label
 * strings on its own side (Pattern 4), so we deliberately do not localize anything here.
 */
export default class CustomerAddressTransformer extends BaseTransformer<CustomerAddress> {
    toObject() {
        return {
            id: this.resource.id,
            kind: this.resource.kind,
            label: this.resource.label,
            first_name: this.resource.firstName,
            last_name: this.resource.lastName,
            company: this.resource.company,
            address_line_1: this.resource.addressLine1,
            address_line_2: this.resource.addressLine2,
            city: this.resource.city,
            region_id: this.resource.regionId,
            region_text: this.resource.regionText,
            postcode: this.resource.postcode,
            country: this.resource.country,
            phone: this.resource.phone,
            is_default: this.resource.isDefault,
            attributes: this.resource.attributes ?? {},
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }
}
