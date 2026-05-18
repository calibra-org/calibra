import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { TaxClassSchema } from "#database/schema";
import TaxRate from "#models/tax_rate";

export default class TaxClass extends TaxClassSchema {
    static table = "tax_classes";

    @hasMany(() => TaxRate, { foreignKey: "taxClassId" })
    declare rates: HasMany<typeof TaxRate>;
}
