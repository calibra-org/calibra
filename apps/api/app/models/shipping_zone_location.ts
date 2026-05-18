import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ShippingZoneLocationSchema } from "#database/schema";
import ShippingZone from "#models/shipping_zone";

export default class ShippingZoneLocation extends ShippingZoneLocationSchema {
    static table = "shipping_zone_locations";

    @belongsTo(() => ShippingZone, { foreignKey: "zoneId" })
    declare zone: BelongsTo<typeof ShippingZone>;
}
