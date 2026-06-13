import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { PlatformAuditEventSchema } from "#database/schema";
import PlatformUser from "#models/platform_user";
import Tenant from "#models/tenant";

/**
 * Control-plane audit row — a platform-operator action (`platform_users` actor) that an
 * `admin_audit_log` row cannot hold. Global, non-RLS; written on the `postgres_admin` connection
 * inside the same transaction as the mutation it records.
 */
export default class PlatformAuditEvent extends PlatformAuditEventSchema {
    static table = "platform_audit_events";

    @belongsTo(() => PlatformUser)
    declare platformUser: BelongsTo<typeof PlatformUser>;

    @belongsTo(() => Tenant)
    declare tenant: BelongsTo<typeof Tenant>;
}
