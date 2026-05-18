import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { PasswordResetTokenSchema } from "#database/schema";
import User from "#models/user";

export default class PasswordResetToken extends PasswordResetTokenSchema {
    static table = "password_reset_tokens";

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;
}
