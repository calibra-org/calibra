import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerTag from "#models/customer_tag";

export default class CustomerTagTransformer extends BaseTransformer<CustomerTag> {
    toObject() {
        return {
            id: this.resource.id,
            name: this.resource.name,
            created_at: this.resource.createdAt?.toISO() ?? null,
        };
    }
}
