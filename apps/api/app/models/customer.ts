import { belongsTo, hasMany, hasOne, manyToMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany, HasOne, ManyToMany } from "@adonisjs/lucid/types/relations";

import { CustomerSchema } from "#database/schema";
import CustomerAddress from "#models/customer_address";
import CustomerDownload from "#models/customer_download";
import CustomerIranProfile from "#models/customer_iran_profile";
import CustomerMarketingConsentHistory from "#models/customer_marketing_consent_history";
import CustomerMarketingPref from "#models/customer_marketing_pref";
import CustomerNote from "#models/customer_note";
import CustomerStatusHistory from "#models/customer_status_history";
import CustomerTag from "#models/customer_tag";
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

    @hasMany(() => CustomerNote, { foreignKey: "customerId" })
    declare notes: HasMany<typeof CustomerNote>;

    @hasMany(() => CustomerStatusHistory, { foreignKey: "customerId" })
    declare statusHistory: HasMany<typeof CustomerStatusHistory>;

    @hasOne(() => CustomerMarketingPref, { foreignKey: "customerId" })
    declare marketingPref: HasOne<typeof CustomerMarketingPref>;

    @hasMany(() => CustomerMarketingConsentHistory, { foreignKey: "customerId" })
    declare marketingHistory: HasMany<typeof CustomerMarketingConsentHistory>;

    @manyToMany(() => CustomerTag, {
        pivotTable: "customer_tag_pivot",
        localKey: "id",
        pivotForeignKey: "customer_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "tag_id",
    })
    declare tags: ManyToMany<typeof CustomerTag>;
}
