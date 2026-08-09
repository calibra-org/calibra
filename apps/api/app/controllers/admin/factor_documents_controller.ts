import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { factorDocumentService } from "#services/factor/document_service";
import type { FactorStatus, FactorType } from "#services/factor/lifecycle";
import type { FactorDocumentInput } from "#services/factor/types";
import {
    adminFactorConvertValidator,
    adminFactorCreateValidator,
    adminFactorListValidator,
    adminFactorManualPaymentValidator,
    adminFactorPaymentLinkValidator,
    adminFactorTransitionValidator,
    adminFactorUpdateValidator,
} from "#validators/admin/factor_validator";

function idFromContext(ctx: HttpContext): number {
    return Number(ctx.params.id);
}

async function actorId(ctx: HttpContext): Promise<number | null> {
    try {
        const user = await ctx.auth.authenticate();
        return Number(user.id);
    } catch {
        return null;
    }
}

export default class AdminFactorDocumentsController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorListValidator);
        return factorDocumentService.list(
            payload as {
                page?: number;
                limit?: number;
                q?: string;
                type?: FactorType;
                status?: FactorStatus;
                customer_id?: number;
                from?: string;
                to?: string;
                sort?: "created_desc" | "created_asc" | "due_asc" | "amount_desc";
            },
        );
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorCreateValidator);
        const result = await factorDocumentService.create(payload as FactorDocumentInput, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "factor.document.create",
            entityKind: "order_document",
            entityId: result.data.id,
            payload: { type: result.data.type, status: result.data.status, reference: result.data.reference },
        });
        return result;
    }

    async show(ctx: HttpContext) {
        return factorDocumentService.detail(idFromContext(ctx));
    }

    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorUpdateValidator);
        const result = await factorDocumentService.update(idFromContext(ctx), payload as FactorDocumentInput, await actorId(ctx));
        await recordAudit({
            ctx,
            action: "factor.document.update",
            entityKind: "order_document",
            entityId: result.data.id,
            payload: { version: result.data.version },
        });
        return result;
    }

    async transition(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorTransitionValidator);
        const result = await factorDocumentService.transition(
            idFromContext(ctx),
            payload.to_status,
            await actorId(ctx),
            payload.reason,
            payload.expected_version,
        );
        await recordAudit({
            ctx,
            action: `factor.document.${payload.to_status}`,
            entityKind: "order_document",
            entityId: result.data.id,
            payload: { reason: payload.reason ?? null },
        });
        return result;
    }

    async convert(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorConvertValidator);
        const result = await factorDocumentService.convert(
            idFromContext(ctx),
            payload.target_type,
            await actorId(ctx),
            payload.expected_version,
            payload.reason,
        );
        await recordAudit({
            ctx,
            action: "factor.document.convert",
            entityKind: "order_document",
            entityId: result.data.id,
            payload: { source_document_id: idFromContext(ctx), target_type: payload.target_type },
        });
        ctx.response.status(201);
        return result;
    }

    async paymentLink(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorPaymentLinkValidator);
        const result = await factorDocumentService.createPaymentLink(
            idFromContext(ctx),
            payload.gateway_id,
            payload.expires_at,
            await actorId(ctx),
            payload.expected_version,
        );
        await recordAudit({
            ctx,
            action: "factor.payment_link.create",
            entityKind: "order_document",
            entityId: idFromContext(ctx),
            payload: { gateway_id: payload.gateway_id, expires_at: payload.expires_at ?? null },
        });
        ctx.response.status(201);
        return result;
    }

    async manualPayment(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorManualPaymentValidator);
        const result = await factorDocumentService.recordManualPayment(idFromContext(ctx), payload, await actorId(ctx));
        await recordAudit({
            ctx,
            action: "factor.payment.manual",
            entityKind: "order_document",
            entityId: idFromContext(ctx),
            payload: { amount_minor: payload.amount_minor, method: payload.method, reference: payload.reference ?? null },
        });
        ctx.response.status(201);
        return result;
    }
}
