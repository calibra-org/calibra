import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { RegionTranslationSchema } from "#database/schema";
import Region from "#models/region";

export default class RegionTranslation extends RegionTranslationSchema {
    static table = "region_translations";

    @belongsTo(() => Region, { foreignKey: "regionId" })
    declare region: BelongsTo<typeof Region>;
}
