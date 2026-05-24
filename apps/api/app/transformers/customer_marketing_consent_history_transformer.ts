import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerMarketingConsentHistory from "#models/customer_marketing_consent_history";

export default class CustomerMarketingConsentHistoryTransformer extends BaseTransformer<CustomerMarketingConsentHistory> {
    toObject() {
        const actor = this.resource.actor ?? null;
        return {
            id: String(this.resource.id),
            customer_id: String(this.resource.customerId),
            channel: this.resource.channel,
            opted_in: this.resource.optedIn,
            source: this.resource.source,
            actor: actor ? { id: String(actor.id), email: actor.email } : null,
            occurred_at: this.resource.occurredAt?.toISO() ?? null,
        };
    }
}
