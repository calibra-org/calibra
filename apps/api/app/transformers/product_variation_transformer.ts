import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductVariation from "#models/product_variation";
import { resolvePrice } from "#services/price_resolver";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductVariationTransformer extends BaseTransformer<ProductVariation> {
    constructor(
        resource: ProductVariation,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const v = this.resource;
        const translation = pickTranslation(v.translations, this.locale);
        const price = resolvePrice({
            regularPrice: v.regularPrice,
            salePrice: v.salePrice,
            saleStartsAt: v.saleStartsAt,
            saleEndsAt: v.saleEndsAt,
        });
        return {
            id: Number(v.id),
            product_id: Number(v.productId),
            sku: v.sku,
            regular_price: v.regularPrice === null ? null : Number(v.regularPrice),
            sale_price: v.salePrice === null ? null : Number(v.salePrice),
            sale_starts_at: v.saleStartsAt?.toISO() ?? null,
            sale_ends_at: v.saleEndsAt?.toISO() ?? null,
            effective_price: price.effectivePrice === null ? null : Number(price.effectivePrice),
            on_sale: price.onSale,
            weight_grams: v.weightGrams,
            length_mm: v.lengthMm,
            width_mm: v.widthMm,
            height_mm: v.heightMm,
            image_media_id: v.imageMediaId === null ? null : Number(v.imageMediaId),
            virtual: v.virtual,
            downloadable: v.downloadable,
            tax_class_id: v.taxClassId === null ? null : Number(v.taxClassId),
            manage_stock_mode: v.manageStockMode,
            menu_order: v.menuOrder,
            description: translation?.description ?? null,
            attribute_pins: (v.attributePins ?? []).map((pin) => ({
                attribute_id: Number(pin.attributeId),
                term_id: Number(pin.termId),
            })),
        };
    }
}
