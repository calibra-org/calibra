import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { ShippingZoneSchema } from "#database/schema";
import ShippingZoneLocation from "#models/shipping_zone_location";
import ShippingZoneMethod from "#models/shipping_zone_method";

export default class ShippingZone extends ShippingZoneSchema {
    static table = "shipping_zones";

    @hasMany(() => ShippingZoneLocation, { foreignKey: "zoneId" })
    declare locations: HasMany<typeof ShippingZoneLocation>;

    @hasMany(() => ShippingZoneMethod, { foreignKey: "zoneId" })
    declare methods: HasMany<typeof ShippingZoneMethod>;
}
