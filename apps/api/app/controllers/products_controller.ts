import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import Product from "#models/product";

const listQuerySchema = vine.object({
    page: vine.number().min(1).optional(),
    per_page: vine.number().min(1).max(100).optional(),
    search: vine.string().trim().minLength(1).optional(),
});

/**
 * Storefront product endpoints. Mounted under `/api/v1/products` in `start/routes.ts`.
 *
 * The response shape (`{ data, meta }`) matches the SDK's `Paginated<T>` type — keep them in sync
 * when extending: a new field added here needs a matching field in `packages/sdk/src/types.ts`.
 */
export default class ProductsController {
    async index({ request }: HttpContext) {
        const {
            page = 1,
            per_page = 24,
            search,
        } = await vine.validate({
            schema: listQuerySchema,
            data: request.qs(),
        });

        const query = Product.query().orderBy("created_at", "desc");
        if (search !== undefined) {
            query.where("name", "ilike", `%${search}%`);
        }

        const products = await query.paginate(page, per_page);
        return {
            data: products.all(),
            meta: {
                page: products.currentPage,
                perPage: products.perPage,
                total: products.total,
                lastPage: products.lastPage,
            },
        };
    }

    async show({ params, response, i18n }: HttpContext) {
        const product = await Product.findBy("slug", params.slug);
        if (product === null) {
            return response.notFound({
                message: i18n.t("messages.products.not_found", { slug: params.slug }),
            });
        }
        return { data: product };
    }
}
