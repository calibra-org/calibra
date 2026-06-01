import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { TenantSchema } from "#database/schema";
import Plan from "#models/plan";
import TenantDomain from "#models/tenant_domain";

/**
 * The tenant registry row — root of the bridge model. Global data (no tenant scoping). `status`
 * gates request handling (suspended/archived shops get a maintenance response); `connectionName`
 * is NULL for shared-DB tenants and set when promoted to a dedicated database.
 */
export default class Tenant extends TenantSchema {
    static table = "tenants";

    @belongsTo(() => Plan)
    declare plan: BelongsTo<typeof Plan>;

    @hasMany(() => TenantDomain)
    declare domains: HasMany<typeof TenantDomain>;
}
