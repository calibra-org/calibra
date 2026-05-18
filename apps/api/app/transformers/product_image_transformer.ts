import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductImage from "#models/product_image";

export default class ProductImageTransformer extends BaseTransformer<ProductImage> {
    toObject() {
        const img = this.resource;
        return {
            id: Number(img.id),
            media_id: Number(img.mediaId),
            position: img.position,
            url: img.media?.url ?? null,
            alt: img.media?.alt ?? null,
        };
    }
}
