import { manyToMany } from "@adonisjs/lucid/orm";
import type { ManyToMany } from "@adonisjs/lucid/types/relations";

import { CustomerTagSchema } from "#database/schema";
import Customer from "#models/customer";

export default class CustomerTag extends CustomerTagSchema {
    static table = "customer_tags";

    @manyToMany(() => Customer, {
        pivotTable: "customer_tag_pivot",
        localKey: "id",
        pivotForeignKey: "tag_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "customer_id",
    })
    declare customers: ManyToMany<typeof Customer>;
}
