import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderDocumentSchema } from "#database/schema";
import Media from "#models/media";
import Order from "#models/order";
import User from "#models/user";

/**
 * Pattern 5 — the generic order-document record. No renderer in this phase; the model exists so
 * future proforma/invoice/packing-slip features ship as `ALTER TYPE order_document_type_enum ADD
 * VALUE 'proforma'` + a `DocumentRenderer` registration + a controller, never a hot-table
 * migration.
 */
export default class OrderDocument extends OrderDocumentSchema {
    static table = "order_documents";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => User, { foreignKey: "issuedByUserId" })
    declare issuedByUser: BelongsTo<typeof User>;

    @belongsTo(() => Media, { foreignKey: "pdfMediaId" })
    declare pdfMedia: BelongsTo<typeof Media>;
}
