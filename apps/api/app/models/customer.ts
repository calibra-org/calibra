import { belongsTo, hasMany, hasOne } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany, HasOne } from "@adonisjs/lucid/types/relations";

import { CustomerSchema } from "#database/schema";
import CustomerAddress from "#models/customer_address";
import CustomerDownload from "#models/customer_download";
import CustomerIranProfile from "#models/customer_iran_profile";
import User from "#models/user";

export default class Customer extends CustomerSchema {
    static table = "customers";

    /**
     * Optional 1:1 link to the auth user. Guest customers have `userId = null` and never join
     * through this relationship; the `belongsTo` returns `null` cleanly in that case.
     */
    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;

    @hasMany(() => CustomerAddress, { foreignKey: "customerId" })
    declare addresses: HasMany<typeof CustomerAddress>;

    @hasMany(() => CustomerDownload, { foreignKey: "customerId" })
    declare downloads: HasMany<typeof CustomerDownload>;

    /**
     * Country-scoped IR fiscal-identifier extension. Absence of a row is the answer to "does this
     * customer have Iranian fiscal identifiers?" — never coerce to a `{}` placeholder, never throw
     * on missing.
     */
    @hasOne(() => CustomerIranProfile, { foreignKey: "customerId" })
    declare iranProfile: HasOne<typeof CustomerIranProfile>;
}
