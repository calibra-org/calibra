import type { HttpContext } from "@adonisjs/core/http";

import IngestContentSourceJob from "#jobs/ingest_content_source_job";
import RunContentAgentJob from "#jobs/run_content_agent_job";
import { recordAudit } from "#services/admin_audit_log_service";
import { contentAgentService } from "#services/content/agent_service";
import { type ContentPostInput, contentService } from "#services/content/content_service";
import type { ContentAgentKind, ContentStatus } from "#services/content/domain";
import {
    adminContentAgentListValidator,
    adminContentAgentReviewValidator,
    adminContentAgentRunValidator,
    adminContentAttributionValidator,
    adminContentPostCreateValidator,
    adminContentPostListValidator,
    adminContentPostUpdateValidator,
    adminContentResourceValidator,
    adminContentRestoreRevisionValidator,
    adminContentSettingsValidator,
    adminContentSignalCreateValidator,
    adminContentSignalListValidator,
    adminContentSignalStatusValidator,
    adminContentSourceValidator,
    adminContentTaxonomyDeleteValidator,
    adminContentTaxonomyValidator,
    adminContentTransitionValidator,
} from "#validators/admin/content_validator";

function id(ctx: HttpContext, key = "id"): number {
    return Number(ctx.params[key]);
}

async function actorId(ctx: HttpContext): Promise<number | null> {
    const user = await ctx.auth.authenticate();
    return user ? Number(user.id) : null;
}

export default class AdminContentController {
    async summary() {
        return contentService.summary();
    }
    async reports() {
        return contentService.reports();
    }
    async calendar(ctx: HttpContext) {
        return contentService.calendar(ctx.request.input("from"), ctx.request.input("to"));
    }
    async settingsShow() {
        return { data: await contentService.settings() };
    }
    async settingsUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentSettingsValidator);
        const result = await contentService.updateSettings(payload as Record<string, unknown>);
        await recordAudit({ ctx, action: "content.settings.patch", entityKind: "settings", entityId: null, payload });
        return result;
    }
    async resources(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentResourceValidator);
        const locale = ctx.i18n.locale === "en" ? "en" : "fa";
        return contentService.resources(payload.kind, payload.q ?? "", payload.limit ?? 20, locale);
    }

    async postsIndex(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentPostListValidator);
        return contentService.list(payload);
    }
    async postsStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentPostCreateValidator);
        const result = await contentService.create(payload as ContentPostInput & { status?: ContentStatus }, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "content.post.create",
            entityKind: "content_post",
            entityId: result.data.id as number,
            payload: { title: result.data.title, status: result.data.status },
        });
        return result;
    }
    async postsShow(ctx: HttpContext) {
        return contentService.detail(id(ctx));
    }
    async postsUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentPostUpdateValidator);
        const result = await contentService.update(
            id(ctx),
            payload as ContentPostInput & { expected_version: number },
            await actorId(ctx),
        );
        await recordAudit({
            ctx,
            action: "content.post.update",
            entityKind: "content_post",
            entityId: id(ctx),
            payload: { expected_version: payload.expected_version },
        });
        return result;
    }
    async postsDestroy(ctx: HttpContext) {
        const expectedVersion = Number(ctx.request.header("if-match") ?? ctx.request.input("expected_version"));
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
            return ctx.response
                .status(428)
                .json({ errors: [{ message: "If-Match version is required", code: "E_PRECONDITION_REQUIRED" }] });
        }
        await contentService.destroy(id(ctx), expectedVersion, await actorId(ctx));
        await recordAudit({
            ctx,
            action: "content.post.delete",
            entityKind: "content_post",
            entityId: id(ctx),
            payload: { expected_version: expectedVersion },
        });
        return ctx.response.status(204);
    }
    async postsTransition(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentTransitionValidator);
        const transition = payload as {
            to_status: ContentStatus;
            expected_version: number;
            scheduled_at?: string | null;
            reason?: string | null;
        };
        const result = await contentService.transition(id(ctx), transition, await actorId(ctx));
        await recordAudit({
            ctx,
            action: `content.post.${payload.to_status}`,
            entityKind: "content_post",
            entityId: id(ctx),
            payload,
        });
        return result;
    }
    async revisions(ctx: HttpContext) {
        return contentService.revisions(id(ctx));
    }
    async attributionsStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentAttributionValidator);
        const result = await contentService.addOrderAttribution(id(ctx), payload, await actorId(ctx));
        await recordAudit({ ctx, action: "content.attribution.create", entityKind: "content_post", entityId: id(ctx), payload });
        ctx.response.status(201);
        return result;
    }
    async attributionsDestroy(ctx: HttpContext) {
        const result = await contentService.removeOrderAttribution(id(ctx), id(ctx, "orderId"), await actorId(ctx));
        await recordAudit({
            ctx,
            action: "content.attribution.delete",
            entityKind: "content_post",
            entityId: id(ctx),
            payload: { order_id: id(ctx, "orderId") },
        });
        return result;
    }
    async restoreRevision(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentRestoreRevisionValidator);
        const result = await contentService.restoreRevision(
            id(ctx, "postId"),
            id(ctx, "revisionId"),
            payload.expected_version,
            await actorId(ctx),
            payload.change_summary,
        );
        await recordAudit({
            ctx,
            action: "content.post.revision.restore",
            entityKind: "content_post",
            entityId: id(ctx, "postId"),
            payload: { revision_id: id(ctx, "revisionId") },
        });
        return result;
    }

    async taxonomyIndex() {
        return contentService.taxonomy();
    }
    async taxonomyStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentTaxonomyValidator);
        const result = await contentService.createTaxonomy(payload);
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: `content.${payload.kind}.create`,
            entityKind: `content_${payload.kind}`,
            entityId: Number((result.data as Record<string, unknown>)?.id ?? 0),
            payload,
        });
        return result;
    }
    async taxonomyUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentTaxonomyValidator);
        const result = await contentService.updateTaxonomy(id(ctx), payload);
        await recordAudit({
            ctx,
            action: `content.${payload.kind}.update`,
            entityKind: `content_${payload.kind}`,
            entityId: id(ctx),
            payload,
        });
        return result;
    }
    async taxonomyDestroy(ctx: HttpContext) {
        const { kind } = await ctx.request.validateUsing(adminContentTaxonomyDeleteValidator);
        await contentService.deleteTaxonomy(kind, id(ctx));
        await recordAudit({
            ctx,
            action: `content.${kind}.delete`,
            entityKind: `content_${kind}`,
            entityId: id(ctx),
            payload: {},
        });
        return ctx.response.status(204);
    }

    async sourcesIndex() {
        return contentService.sources();
    }
    async sourcesStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentSourceValidator);
        const result = await contentService.createSource(payload as Record<string, unknown>, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "content.source.create",
            entityKind: "content_source",
            entityId: Number((result.data as Record<string, unknown>)?.id ?? 0),
            payload,
        });
        return result;
    }
    async sourcesUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentSourceValidator);
        const result = await contentService.updateSource(id(ctx), payload as Record<string, unknown>);
        await recordAudit({ ctx, action: "content.source.update", entityKind: "content_source", entityId: id(ctx), payload });
        return result;
    }
    async sourcesDestroy(ctx: HttpContext) {
        await contentService.deleteSource(id(ctx));
        await recordAudit({ ctx, action: "content.source.delete", entityKind: "content_source", entityId: id(ctx), payload: {} });
        return ctx.response.status(204);
    }
    async sourcesIngest(ctx: HttpContext) {
        const sourceId = id(ctx);
        await IngestContentSourceJob.dispatch({ sourceId });
        await recordAudit({
            ctx,
            action: "content.source.ingest",
            entityKind: "content_source",
            entityId: sourceId,
            payload: {},
        });
        ctx.response.status(202);
        return { data: { accepted: true, source_id: sourceId } };
    }

    async signalsIndex(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentSignalListValidator);
        return contentService.signals(payload);
    }
    async signalsStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentSignalCreateValidator);
        const result = await contentService.createSignal(payload as Record<string, unknown>);
        ctx.response.status(result.deduplicated ? 200 : 201);
        return result;
    }
    async signalsStatus(ctx: HttpContext) {
        const { status } = await ctx.request.validateUsing(adminContentSignalStatusValidator);
        return contentService.updateSignalStatus(id(ctx), status);
    }
    async signalsConvert(ctx: HttpContext) {
        const result = await contentService.signalToDraft(id(ctx), await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "content.signal.convert",
            entityKind: "content_signal",
            entityId: id(ctx),
            payload: { post_id: result.data.id },
        });
        return result;
    }

    async agentsIndex(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentAgentListValidator);
        return contentAgentService.list(payload);
    }
    async agentsShow(ctx: HttpContext) {
        return contentAgentService.detail(id(ctx));
    }
    async agentsRun(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentAgentRunValidator);
        const agentInput = payload as {
            agent_kind: ContentAgentKind;
            post_id?: number | null;
            signal_id?: number | null;
            instruction: string;
            use_web_search?: boolean;
        };
        const result = await contentAgentService.createRun(agentInput, await actorId(ctx));
        const runId = Number(result.data.id);
        if (result.data.status === "queued") await RunContentAgentJob.dispatch({ runId });
        ctx.response.status(202);
        await recordAudit({
            ctx,
            action: "content.agent.run",
            entityKind: "content_agent_run",
            entityId: runId,
            payload: { agent_kind: payload.agent_kind, post_id: payload.post_id ?? null, signal_id: payload.signal_id ?? null },
        });
        return result;
    }
    async agentsReview(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentAgentReviewValidator);
        const result = await contentAgentService.review(id(ctx), payload.decision, await actorId(ctx), payload.note);
        await recordAudit({
            ctx,
            action: `content.agent.${payload.decision}`,
            entityKind: "content_agent_run",
            entityId: id(ctx),
            payload,
        });
        return result;
    }
    async agentsApply(ctx: HttpContext) {
        const result = await contentAgentService.apply(id(ctx), await actorId(ctx));
        await recordAudit({
            ctx,
            action: "content.agent.apply",
            entityKind: "content_agent_run",
            entityId: id(ctx),
            payload: { post_id: result.post.id },
        });
        return result;
    }
}
