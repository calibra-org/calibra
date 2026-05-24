import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerSegment from "#models/customer_segment";

export default class CustomerSegmentTransformer extends BaseTransformer<CustomerSegment> {
    toObject() {
        return {
            id: this.resource.id,
            user_id: this.resource.userId,
            name: this.resource.name,
            filters: this.resource.filters ?? {},
            is_pinned: this.resource.isPinned,
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
            last_used_at: this.resource.lastUsedAt?.toISO() ?? null,
        };
    }
}
