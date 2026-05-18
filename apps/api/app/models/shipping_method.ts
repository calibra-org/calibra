import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { ShippingMethodSchema } from "#database/schema";
import ShippingZoneMethod from "#models/shipping_zone_method";

export default class ShippingMethod extends ShippingMethodSchema {
    static table = "shipping_methods";

    @hasMany(() => ShippingZoneMethod, { foreignKey: "methodId" })
    declare instances: HasMany<typeof ShippingZoneMethod>;
}
