import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import PaymentGatewayTransformer, { readImplementationStatus } from "#transformers/payment_gateway_transformer";
import {
    adminPaymentGatewayListValidator,
    adminPaymentGatewayUpdateValidator,
} from "#validators/admin/payment_gateway_validator";

/**
 * Admin CRUD over `payment_gateways`. Read-side masks sensitive setting keys
 * (`merchant_id`, `api_key`, …) via {@link PaymentGatewayTransformer}; the underlying values
 * round-trip safely because PATCH treats missing keys as "leave existing value alone".
 */
export default class AdminPaymentGatewaysController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminPaymentGatewayListValidator);
        const query = PaymentGateway.query().orderBy("ordering").orderBy("id");
        if (payload.enabled !== undefined) query.where("enabled", payload.enabled);
        const rows = await query;
        return { data: rows.map((row) => new PaymentGatewayTransformer(row).forAdmin()) };
    }

    async show(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    async update(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminPaymentGatewayUpdateValidator);
        if (payload.enabled === true && readImplementationStatus(gateway) === "stub") {
            /**
             * Operator cannot flip a stub gateway to enabled — neither the storefront submit
             * flow nor a stray PSP callback could complete against it, so the toggle is
             * load-bearing dishonesty. A future PSP integration ships a real adapter and bumps
             * the seed row's `implementation_status` to `"live"` in the same PR.
             */
            throw new GatewayNotImplementedException(gateway.code, "enable");
        }
        if (payload.enabled !== undefined) gateway.enabled = payload.enabled;
        if (payload.ordering !== undefined) gateway.ordering = payload.ordering;
        if (payload.settings) {
            const existing = (gateway.settings as Record<string, unknown>) ?? {};
            gateway.settings = { ...existing, ...payload.settings };
        }
        if (payload.supports) {
            const existing = (gateway.supports as Record<string, unknown>) ?? {};
            gateway.supports = { ...existing, ...payload.supports };
        }
        await gateway.save();
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    private async findOrFail(id: unknown): Promise<PaymentGateway> {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Payment gateway not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const row = await PaymentGateway.find(numericId);
        if (!row) {
            throw new Exception("Payment gateway not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return row;
    }
}
