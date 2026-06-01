import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TenantImpersonationEventSchema } from "#database/schema";
import PlatformUser from "#models/platform_user";
import Tenant from "#models/tenant";

/**
 * Audit record of a platform operator impersonating a tenant's shop admin (global control-plane
 * data, no RLS). `endedAt` is set when the operator exits impersonation.
 */
export default class TenantImpersonationEvent extends TenantImpersonationEventSchema {
    static table = "tenant_impersonation_events";

    @belongsTo(() => PlatformUser)
    declare platformUser: BelongsTo<typeof PlatformUser>;

    @belongsTo(() => Tenant)
    declare tenant: BelongsTo<typeof Tenant>;
}
