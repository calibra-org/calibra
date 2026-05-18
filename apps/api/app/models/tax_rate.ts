import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TaxRateSchema } from "#database/schema";
import Region from "#models/region";
import TaxClass from "#models/tax_class";

export default class TaxRate extends TaxRateSchema {
    static table = "tax_rates";

    @column()
    declare postcodes: string[] | null;

    @column()
    declare cities: string[] | null;

    @belongsTo(() => TaxClass, { foreignKey: "taxClassId" })
    declare taxClass: BelongsTo<typeof TaxClass>;

    @belongsTo(() => Region, { foreignKey: "regionId" })
    declare region: BelongsTo<typeof Region>;

    /**
     * Postgres numeric(7,4) returns through the pg driver as a string so precision is preserved.
     * Tax math is in integer minor units; downstream callers that need a JS number for display
     * convert through this accessor and accept the rounding implied by `Number()`.
     */
    get rateAsNumber(): number {
        return Number.parseFloat(this.rate);
    }
}
