import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerMarketingPref from "#models/customer_marketing_pref";

export default class CustomerMarketingPrefTransformer extends BaseTransformer<CustomerMarketingPref> {
    toObject() {
        return {
            customer_id: this.resource.customerId,
            email_opt_in: this.resource.emailOptIn,
            email_opt_in_at: this.resource.emailOptInAt?.toISO() ?? null,
            email_opt_in_source: this.resource.emailOptInSource,
            sms_opt_in: this.resource.smsOptIn,
            sms_opt_in_at: this.resource.smsOptInAt?.toISO() ?? null,
            sms_opt_in_source: this.resource.smsOptInSource,
            phone_call_opt_in: this.resource.phoneCallOptIn,
            phone_call_opt_in_at: this.resource.phoneCallOptInAt?.toISO() ?? null,
            phone_call_opt_in_source: this.resource.phoneCallOptInSource,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }

    /**
     * Default-shape preference row used when a customer has no `customer_marketing_prefs` row yet.
     * Lets the API surface always carry a populated object instead of `null`, simplifying the UI.
     */
    static defaults(customerId: bigint | number) {
        return {
            customer_id: customerId,
            email_opt_in: false,
            email_opt_in_at: null,
            email_opt_in_source: null,
            sms_opt_in: false,
            sms_opt_in_at: null,
            sms_opt_in_source: null,
            phone_call_opt_in: false,
            phone_call_opt_in_at: null,
            phone_call_opt_in_source: null,
            updated_at: null,
        };
    }
}
