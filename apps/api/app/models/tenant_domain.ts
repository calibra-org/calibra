import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TenantDomainSchema } from "#database/schema";
import Tenant from "#models/tenant";

/**
 * Hostname → tenant mapping (global). One `subdomain` row per tenant is auto-created at
 * provisioning; `custom` rows are added later. `tenant_context_middleware` resolves the request's
 * tenant from this table on the admin connection.
 */
export default class TenantDomain extends TenantDomainSchema {
    static table = "tenant_domains";

    @belongsTo(() => Tenant)
    declare tenant: BelongsTo<typeof Tenant>;
}
