import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductGroupMemberSchema } from "#database/schema";
import Product from "#models/product";

export default class ProductGroupMember extends ProductGroupMemberSchema {
    static table = "product_group_members";

    @belongsTo(() => Product, { foreignKey: "groupProductId" })
    declare groupProduct: BelongsTo<typeof Product>;

    @belongsTo(() => Product, { foreignKey: "memberProductId" })
    declare memberProduct: BelongsTo<typeof Product>;
}
