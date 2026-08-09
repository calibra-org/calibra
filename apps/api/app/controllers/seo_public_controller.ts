import type { HttpContext } from "@adonisjs/core/http";

import { serializeSitemapXml } from "#services/seo/builders";
import { SEO_ENTITY_KINDS, type SeoEntityKind } from "#services/seo/domain";
import { seoService } from "#services/seo/seo_service";

function locale(ctx: HttpContext): "fa" | "en" {
    return ctx.request.input("locale") === "en" || ctx.i18n.locale === "en" ? "en" : "fa";
}

export default class SeoPublicController {
    async robots({ response }: HttpContext) {
        const preview = await seoService.robotsPreview();
        response.header("Content-Type", "text/plain; charset=utf-8");
        response.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
        return preview.data.text;
    }

    async sitemap(ctx: HttpContext) {
        const entries = (await Promise.all([seoService.sitemapEntries("fa"), seoService.sitemapEntries("en")])).flat();
        ctx.response.header("Content-Type", "application/xml; charset=utf-8");
        ctx.response.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
        return serializeSitemapXml(entries);
    }

    async organization() {
        const settings = await seoService.settings();
        const { buildOrganizationSchema } = await import("#services/seo/builders");
        return { data: buildOrganizationSchema(settings) };
    }

    async entity(ctx: HttpContext) {
        const kind = String(ctx.params.kind);
        const id = Number(ctx.params.id);
        if (!SEO_ENTITY_KINDS.includes(kind as SeoEntityKind) || !Number.isSafeInteger(id) || id < 1) {
            return ctx.response.status(404).json({ error: "seo_entity_not_found" });
        }
        return seoService.publicEntity(kind as SeoEntityKind, id, locale(ctx));
    }

    async redirect({ request }: HttpContext) {
        const path = String(request.input("path") ?? "");
        if (!path) return { data: null };
        const trx = (await import("#services/tenant_context")).currentTrx();
        const row = await trx
            .from("seo_redirects")
            .where("source_path", path.startsWith("/") ? path : `/${path}`)
            .where("enabled", true)
            .first();
        if (row) {
            await trx
                .from("seo_redirects")
                .where("id", row.id)
                .update({ hit_count: trx.raw("hit_count + 1"), last_hit_at: new Date(), updated_at: new Date() });
        }
        return {
            data: row
                ? {
                      target_path: row.target_path,
                      status_code: Number(row.status_code),
                  }
                : null,
        };
    }
}
