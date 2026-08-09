import type { HttpContext } from "@adonisjs/core/http";

import { contentService } from "#services/content/content_service";
import { publicContentEventValidator, publicContentListValidator } from "#validators/admin/content_validator";

export default class PublicContentController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicContentListValidator);
        return contentService.publicList(payload);
    }

    async show(ctx: HttpContext) {
        const locale = String(ctx.request.input("locale", "fa"));
        if (!(["fa", "en"] as const).includes(locale as "fa" | "en")) {
            return ctx.response
                .status(422)
                .json({ errors: [{ message: "locale must be fa or en", code: "E_VALIDATION_ERROR" }] });
        }
        return contentService.publicDetail(String(ctx.params.slug), locale);
    }

    async event(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicContentEventValidator);
        ctx.response.status(202);
        return contentService.trackPublicEvent(payload);
    }
}
