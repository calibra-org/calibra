import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerIranProfile from "#models/customer_iran_profile";

/**
 * Serializer for the `customer_iran_profiles` extension row. Only invoked when the row actually
 * exists for the customer — callers gate on row presence so the parent transformer can decide
 * whether to add the `profile_extensions.iran` key at all (vs. omitting it for non-Iranian
 * customers).
 */
export default class CustomerIranProfileTransformer extends BaseTransformer<CustomerIranProfile> {
    toObject() {
        return {
            national_id: this.resource.nationalId,
            corporate_national_id: this.resource.corporateNationalId,
            economic_code: this.resource.economicCode,
            legal_company_name_fa: this.resource.legalCompanyNameFa,
            vat_taxpayer_status: this.resource.vatTaxpayerStatus,
            attributes: this.resource.attributes ?? {},
        };
    }
}
