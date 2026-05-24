import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { AdminAuditLogSchema } from "#database/schema";
import User from "#models/user";

export default class AdminAuditLog extends AdminAuditLogSchema {
    static table = "admin_audit_log";

    @belongsTo(() => User, { foreignKey: "actorUserId" })
    declare actor: BelongsTo<typeof User>;
}
