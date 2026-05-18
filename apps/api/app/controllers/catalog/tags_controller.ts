import type { HttpContext } from "@adonisjs/core/http";

import ProductTag from "#models/product_tag";
import { collection } from "#transformers/api_envelope";
import ProductTagTransformer from "#transformers/product_tag_transformer";

export default class TagsController {
    /** `GET /api/v1/tags` — list product tags with their localized name + slug. */
    async index(ctx: HttpContext) {
        const rows = await ProductTag.query().preload("translations").orderBy("menu_order", "asc").orderBy("id", "asc");
        return collection(ProductTagTransformer.transform(rows, ctx.i18n.locale));
    }
}
