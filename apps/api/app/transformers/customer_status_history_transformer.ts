import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerStatusHistory from "#models/customer_status_history";

export default class CustomerStatusHistoryTransformer extends BaseTransformer<CustomerStatusHistory> {
    toObject() {
        const actor = this.resource.actor ?? null;
        return {
            id: String(this.resource.id),
            customer_id: String(this.resource.customerId),
            from_status: this.resource.fromStatus,
            to_status: this.resource.toStatus,
            reason: this.resource.reason,
            actor: actor ? { id: String(actor.id), email: actor.email } : null,
            occurred_at: this.resource.occurredAt?.toISO() ?? null,
        };
    }
}
