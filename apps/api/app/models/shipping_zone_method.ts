import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ShippingZoneMethodSchema } from "#database/schema";
import ShippingMethod from "#models/shipping_method";
import ShippingZone from "#models/shipping_zone";

export default class ShippingZoneMethod extends ShippingZoneMethodSchema {
    static table = "shipping_zone_methods";

    @belongsTo(() => ShippingZone, { foreignKey: "zoneId" })
    declare zone: BelongsTo<typeof ShippingZone>;

    @belongsTo(() => ShippingMethod, { foreignKey: "methodId" })
    declare method: BelongsTo<typeof ShippingMethod>;
}
