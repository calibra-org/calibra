import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { RegionSchema } from "#database/schema";
import RegionTranslation from "#models/region_translation";

export default class Region extends RegionSchema {
    static table = "regions";

    @hasMany(() => RegionTranslation, { foreignKey: "regionId" })
    declare translations: HasMany<typeof RegionTranslation>;

    @belongsTo(() => Region, { foreignKey: "parentId" })
    declare parent: BelongsTo<typeof Region>;

    @hasMany(() => Region, { foreignKey: "parentId" })
    declare children: HasMany<typeof Region>;
}
