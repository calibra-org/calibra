import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerDownloadSchema } from "#database/schema";
import Customer from "#models/customer";

export default class CustomerDownload extends CustomerDownloadSchema {
    static table = "customer_downloads";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;
}
