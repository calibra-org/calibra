import type { HttpContext } from "@adonisjs/core/http";

import ProductBrand from "#models/product_brand";
import { collection } from "#transformers/api_envelope";
import ProductBrandTransformer from "#transformers/product_brand_transformer";

export default class BrandsController {
    /** `GET /api/v1/brands` — list brand entries with localized name + slug. */
    async index(ctx: HttpContext) {
        const rows = await ProductBrand.query().preload("translations").orderBy("menu_order", "asc").orderBy("id", "asc");
        return collection(ProductBrandTransformer.transform(rows, ctx.i18n.locale));
    }
}
