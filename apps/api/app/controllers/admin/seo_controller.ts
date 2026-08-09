import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { SEO_ENTITY_KINDS, type SeoEntityKind, type SeoSiteSettings } from "#services/seo/domain";
import { seoService } from "#services/seo/seo_service";
import {
    adminSeoAuditRunValidator,
    adminSeoCompetitorValidator,
    adminSeoEntityListValidator,
    adminSeoIndexNowValidator,
    adminSeoIntegrationValidator,
    adminSeoInternalLinkValidator,
    adminSeoIssueListValidator,
    adminSeoIssueStatusValidator,
    adminSeoKeywordUpdateValidator,
    adminSeoKeywordValidator,
    adminSeoListValidator,
    adminSeoProfileUpdateValidator,
    adminSeoRedirectValidator,
    adminSeoSettingsValidator,
} from "#validators/admin/seo_validator";

function id(ctx: HttpContext): number {
    const value = Number(ctx.params.id);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Exception("Invalid SEO resource identifier", { status: 422, code: "E_SEO_INVALID_ID" });
    }
    return value;
}

function kind(ctx: HttpContext): SeoEntityKind {
    const value = String(ctx.params.kind);
    if (!SEO_ENTITY_KINDS.includes(value as SeoEntityKind)) {
        throw new Exception("Invalid SEO entity kind", { status: 422, code: "E_SEO_INVALID_KIND" });
    }
    return value as SeoEntityKind;
}

function locale(ctx: HttpContext): "fa" | "en" {
    return ctx.request.input("locale") === "en" || ctx.i18n.locale === "en" ? "en" : "fa";
}

async function actorId(ctx: HttpContext): Promise<number | null> {
    const user = await ctx.auth.authenticate();
    return user ? Number(user.id) : null;
}

export default class AdminSeoController {
    async overview(ctx: HttpContext) {
        return seoService.overview(locale(ctx));
    }

    async reports(ctx: HttpContext) {
        return seoService.reports(locale(ctx));
    }

    async settingsShow() {
        return { data: await seoService.settings() };
    }

    async settingsUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoSettingsValidator);
        const result = await seoService.updateSettings(payload as Partial<SeoSiteSettings>);
        if (result.changed) {
            await recordAudit({ ctx, action: "seo.settings.patch", entityKind: "settings", entityId: null, payload });
        }
        return result;
    }

    async entities(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoEntityListValidator);
        return seoService.listEntities(payload);
    }

    async entity(ctx: HttpContext) {
        return seoService.entity(kind(ctx), id(ctx), locale(ctx));
    }

    async profileUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoProfileUpdateValidator);
        const entityKind = kind(ctx);
        const entityId = id(ctx);
        const result = await seoService.updateProfile(
            entityKind,
            entityId,
            payload.locale ?? locale(ctx),
            payload,
            await actorId(ctx),
        );
        await recordAudit({
            ctx,
            action: "seo.profile.patch",
            entityKind: `seo_${entityKind}`,
            entityId,
            payload: { locale: payload.locale ?? locale(ctx), expected_version: payload.expected_version },
        });
        return result;
    }

    async entityAudit(ctx: HttpContext) {
        const entityKind = kind(ctx);
        const entityId = id(ctx);
        const result = await seoService.auditEntity(entityKind, entityId, locale(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.audit.entity", entityKind: `seo_${entityKind}`, entityId, payload: {} });
        return result;
    }

    async auditAll(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoAuditRunValidator);
        const result = await seoService.auditAll(payload, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.audit.full", entityKind: "seo_audit", entityId: result.data.id, payload });
        return result;
    }

    async issues(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoIssueListValidator);
        return seoService.listIssues(payload);
    }

    async issueStatus(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoIssueStatusValidator);
        const result = await seoService.updateIssueStatus(id(ctx), payload.status, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.issue.status", entityKind: "seo_issue", entityId: id(ctx), payload });
        return result;
    }

    async keywords(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoListValidator);
        return seoService.listKeywords(payload);
    }

    async keywordCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoKeywordValidator);
        const result = await seoService.createKeyword(payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.keyword.create",
            entityKind: "seo_keyword",
            entityId: Number((result.data as Record<string, unknown>).id),
            payload,
        });
        return result;
    }

    async keywordUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoKeywordUpdateValidator);
        const result = await seoService.updateKeyword(id(ctx), payload, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.keyword.patch", entityKind: "seo_keyword", entityId: id(ctx), payload });
        return result;
    }

    async keywordDelete(ctx: HttpContext) {
        await seoService.deleteKeyword(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.keyword.delete", entityKind: "seo_keyword", entityId: id(ctx), payload: {} });
        ctx.response.status(204);
    }

    async competitors(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoListValidator);
        return seoService.listCompetitors(payload);
    }

    async competitorCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoCompetitorValidator);
        const result = await seoService.saveCompetitor(null, payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.competitor.create",
            entityKind: "seo_competitor",
            entityId: Number((result.data as Record<string, unknown>).id),
            payload,
        });
        return result;
    }

    async competitorUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoCompetitorValidator);
        const result = await seoService.saveCompetitor(id(ctx), payload, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.competitor.patch", entityKind: "seo_competitor", entityId: id(ctx), payload });
        return result;
    }

    async competitorDelete(ctx: HttpContext) {
        await seoService.deleteCompetitor(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.competitor.delete", entityKind: "seo_competitor", entityId: id(ctx), payload: {} });
        ctx.response.status(204);
    }

    async internalLinks(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoListValidator);
        return seoService.listInternalLinks(payload);
    }

    async internalLinkCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoInternalLinkValidator);
        const result = await seoService.saveInternalLink(null, payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.link.create",
            entityKind: "seo_internal_link",
            entityId: Number((result.data as Record<string, unknown>).id),
            payload,
        });
        return result;
    }

    async internalLinkUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoInternalLinkValidator);
        const result = await seoService.saveInternalLink(id(ctx), payload, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.link.patch", entityKind: "seo_internal_link", entityId: id(ctx), payload });
        return result;
    }

    async internalLinkDelete(ctx: HttpContext) {
        await seoService.deleteInternalLink(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.link.delete", entityKind: "seo_internal_link", entityId: id(ctx), payload: {} });
        ctx.response.status(204);
    }

    async redirects(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoListValidator);
        return seoService.listRedirects(payload);
    }

    async redirectCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoRedirectValidator);
        const result = await seoService.saveRedirect(null, payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.redirect.create",
            entityKind: "seo_redirect",
            entityId: Number((result.data as Record<string, unknown>).id),
            payload,
        });
        return result;
    }

    async redirectUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoRedirectValidator);
        const result = await seoService.saveRedirect(id(ctx), payload, await actorId(ctx));
        await recordAudit({ ctx, action: "seo.redirect.patch", entityKind: "seo_redirect", entityId: id(ctx), payload });
        return result;
    }

    async redirectDelete(ctx: HttpContext) {
        await seoService.deleteRedirect(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.redirect.delete", entityKind: "seo_redirect", entityId: id(ctx), payload: {} });
        ctx.response.status(204);
    }

    async integrations() {
        return seoService.integrations();
    }

    async integrationUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoIntegrationValidator);
        const result = await seoService.saveIntegration(payload, await actorId(ctx));
        await recordAudit({
            ctx,
            action: "seo.integration.patch",
            entityKind: "seo_integration",
            entityId: null,
            payload: { provider: payload.provider, status: payload.status },
        });
        return result;
    }

    async indexNowSubmit(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminSeoIndexNowValidator);
        const result = await seoService.submitIndexNow(payload, await actorId(ctx));
        await recordAudit({
            ctx,
            action: "seo.indexnow.submit",
            entityKind: "seo_integration",
            entityId: null,
            payload: { url_count: payload.urls?.length ?? null },
        });
        return result;
    }

    async robotsPreview() {
        return seoService.robotsPreview();
    }

    async sitemapPreview(ctx: HttpContext) {
        return seoService.sitemapPreview(locale(ctx));
    }

    async schemaPreview(ctx: HttpContext) {
        return seoService.schemaPreview(kind(ctx), id(ctx), locale(ctx));
    }
}
