import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerSegmentSchema } from "#database/schema";
import User from "#models/user";

export default class CustomerSegment extends CustomerSegmentSchema {
    static table = "customer_segments";

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;
}
