import { BaseModel, column } from "@adonisjs/lucid/orm";
import type { DateTime } from "luxon";

/**
 * Catalog product. `priceCents` is stored as an integer in the database to avoid float math —
 * convert to a major-unit string only at the response edge.
 *
 * Add WooCommerce-style variants, attributes, and inventory tables as siblings (Variant, Attribute,
 * StockMovement) rather than denormalizing here.
 */
export default class Product extends BaseModel {
    @column({ isPrimary: true })
    declare id: number;

    @column()
    declare slug: string;

    @column()
    declare name: string;

    @column()
    declare description: string;

    /** Price in minor units (cents). Always an integer. */
    @column({ columnName: "price_cents" })
    declare priceCents: number;

    /** ISO 4217 currency code (e.g. `"USD"`, `"IRR"`). */
    @column()
    declare currency: string;

    /** `null` when stock is untracked (e.g. digital goods). */
    @column({ columnName: "stock_quantity" })
    declare stockQuantity: number | null;

    /** Primary image URL. Additional images belong on a `product_images` join table. */
    @column({ columnName: "image_url" })
    declare imageUrl: string | null;

    @column.dateTime({ autoCreate: true, serializeAs: "createdAt" })
    declare createdAt: DateTime;

    @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: "updatedAt" })
    declare updatedAt: DateTime;
}
