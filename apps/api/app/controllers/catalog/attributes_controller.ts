import type { HttpContext } from "@adonisjs/core/http";

import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";
import { collection } from "#transformers/api_envelope";
import ProductAttributeTermTransformer from "#transformers/product_attribute_term_transformer";
import ProductAttributeTransformer from "#transformers/product_attribute_transformer";

export default class AttributesController {
    /** `GET /api/v1/attributes` — list attributes (color, size, etc.) with localized names. */
    async index(ctx: HttpContext) {
        const rows = await ProductAttribute.query().preload("translations").orderBy("id", "asc");
        return collection(ProductAttributeTransformer.transform(rows, ctx.i18n.locale));
    }

    /** `GET /api/v1/attributes/:id/terms` — terms for an attribute. */
    async terms(ctx: HttpContext) {
        const attribute = await ProductAttribute.find(ctx.params.id);
        if (!attribute) {
            return ctx.response.status(404).json({ error: "attribute_not_found" });
        }
        const terms = await ProductAttributeTerm.query()
            .where("attribute_id", String(attribute.id))
            .preload("translations")
            .orderBy("menu_order", "asc")
            .orderBy("id", "asc");
        return collection(ProductAttributeTermTransformer.transform(terms, ctx.i18n.locale));
    }
}
