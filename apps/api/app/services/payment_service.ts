import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import emitter from "@adonisjs/core/services/emitter";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import { GatewayNotConfiguredException } from "#exceptions/payment_exceptions";
import Order from "#models/order";
import PaymentAttempt from "#models/payment_attempt";
import { orderStateMachine } from "#services/order_state_machine";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import SettingsService from "#services/settings_service";

const DEFAULT_RETURN_SUCCESS = "http://localhost:3000/checkout/success";
const DEFAULT_RETURN_FAILED = "http://localhost:3000/checkout/failed";
const DEFAULT_CALLBACK_BASE = "http://localhost:3333";

export interface PaymentInitResult {
    attempt: PaymentAttempt;
    /** `null` for non-redirect gateways (cod, bank_transfer). */
    redirect_url: string | null;
}

export interface PaymentCallbackResult {
    order: Order;
    attempt: PaymentAttempt | null;
    /** Absolute URL the controller should `response.redirect()` to. */
    redirect: string;
}

export interface PaymentRefundResult {
    ok: boolean;
    gateway_refund_id?: string;
    error_code?: string;
    error_message?: string;
}

/**
 * Orchestrates the three payment lifecycle moves: `init`, `verifyCallback`, `refund`. Wraps every
 * write in a transaction so a mid-flow failure leaves no half-applied state — and uses
 * `FOR UPDATE` on the attempt row inside `verifyCallback` so concurrent PSP retries serialize at
 * the database, not in app code. Controllers never call adapter methods directly; they go through
 * here.
 */
export class PaymentService {
    constructor(private readonly settings = new SettingsService()) {}

    /**
     * Materialize a `payment_attempts` row, call the adapter's `init`, and stash the result. For
     * redirect gateways the storefront then 302s the browser to `redirect_url`. For non-redirect
     * gateways (cod, bank_transfer) the order is transitioned to `on_hold` and the attempt is
     * marked `verified` (no PSP callback ever arrives).
     *
     * Idempotent on `(order_id, idempotency_key)`: a replayed init with the same key returns the
     * existing attempt instead of creating a duplicate.
     */
    async init(order: Order, gatewayId: number | bigint, idempotencyKey: string | null): Promise<PaymentInitResult> {
        if (idempotencyKey) {
            const existing = await PaymentAttempt.query()
                .where("order_id", Number(order.id))
                .where("idempotency_key", idempotencyKey)
                .first();
            if (existing) {
                return {
                    attempt: existing,
                    redirect_url: this.redirectUrlFromAttemptPayload(existing),
                };
            }
        }

        const { adapter, gateway } = await paymentAdapterRegistry.resolveForGatewayId(gatewayId);
        const returnUrl = await this.buildCallbackUrl(gateway.code, order);
        const attempt = await db.transaction(async (trx) => {
            const row = new PaymentAttempt();
            row.useTransaction(trx);
            row.orderId = order.id;
            row.gatewayId = gateway.id;
            row.gatewayCodeSnapshot = gateway.code;
            row.status = PaymentAttemptStatus.Initiated;
            row.amountMinor = Number(order.grandTotal);
            row.currency = order.currency;
            row.idempotencyKey = idempotencyKey;
            row.gatewayPayload = {};
            row.initiatedAt = DateTime.utc();
            await row.save();
            return row;
        });

        let initResult: Awaited<ReturnType<typeof adapter.init>>;
        try {
            initResult = await adapter.init({
                order,
                attempt,
                settings: (gateway.settings as Record<string, unknown>) ?? {},
                return_url: returnUrl,
            });
        } catch (error) {
            attempt.status = PaymentAttemptStatus.Failed;
            attempt.errorCode = this.errorCodeFromException(error);
            attempt.errorMessage = (error as Error).message ?? "init threw";
            attempt.gatewayPayload = { error: String((error as Error).message ?? error) };
            await attempt.save();
            await this.linkLatest(order, attempt);
            throw error;
        }

        await db.transaction(async (trx) => {
            attempt.useTransaction(trx);
            attempt.gatewayPayload = (initResult.payload as Record<string, unknown>) ?? {};
            if (initResult.authority) attempt.gatewayAuthority = initResult.authority;

            if (adapter.capabilities.redirect) {
                if (!initResult.redirect_url) {
                    attempt.status = PaymentAttemptStatus.Failed;
                    attempt.errorCode = "init_no_redirect";
                    attempt.errorMessage = "Adapter returned no redirect_url despite capabilities.redirect";
                } else {
                    attempt.status = PaymentAttemptStatus.AwaitingCallback;
                }
                await attempt.save();
            } else {
                /**
                 * cod / bank_transfer: no PSP callback ever arrives, so we mark the attempt
                 * verified inline and transition the order to on_hold. Treasury reconciles offline.
                 */
                attempt.status = PaymentAttemptStatus.Verified;
                attempt.verifiedAt = DateTime.utc();
                await attempt.save();
                if (order.status === OrderStatus.Pending) {
                    await orderStateMachine.transition(order, OrderStatus.OnHold, {
                        reason: `payment.${gateway.code}.no_redirect`,
                        trx,
                    });
                }
            }
        });

        await this.linkLatest(order, attempt);

        return { attempt, redirect_url: initResult.redirect_url };
    }

    /**
     * Verify-callback flow: parse the PSP query/body, lock the matching attempt row, re-check
     * amount + idempotency, call adapter.verify, and transition the order. Returns the URL the
     * storefront should redirect the user to.
     */
    async verifyCallback(gatewayCode: string, request: HttpContext["request"]): Promise<PaymentCallbackResult> {
        const successUrl = await this.settings.get<string>("general", "checkout_return_url_success", DEFAULT_RETURN_SUCCESS);
        const failedUrl = await this.settings.get<string>("general", "checkout_return_url_failed", DEFAULT_RETURN_FAILED);

        const { adapter, gateway } = await paymentAdapterRegistry.resolveForCode(gatewayCode);
        if (!adapter.parseCallback || !adapter.verify) {
            throw new GatewayNotConfiguredException(gatewayCode, `Gateway "${gatewayCode}" does not support callbacks`);
        }
        const parsed = adapter.parseCallback({ request, settings: (gateway.settings as Record<string, unknown>) ?? {} });
        if (!parsed.authority) {
            return {
                order: undefined as unknown as Order,
                attempt: null,
                redirect: this.attachReason(failedUrl, "missing_authority"),
            };
        }

        const result = await db.transaction(async (trx) => {
            const attempt = await PaymentAttempt.query({ client: trx })
                .where("gateway_id", Number(gateway.id))
                .where("gateway_authority", String(parsed.authority))
                .forUpdate()
                .first();
            if (!attempt) {
                throw new Exception("No matching payment attempt found for callback", {
                    status: 404,
                    code: "E_PAYMENT_ATTEMPT_NOT_FOUND",
                });
            }
            const order = await Order.query({ client: trx }).where("id", Number(attempt.orderId)).forUpdate().firstOrFail();

            if (parsed.status === "cancelled" || parsed.status === "failed") {
                if (attempt.status !== PaymentAttemptStatus.Verified) {
                    attempt.status = parsed.status === "cancelled" ? PaymentAttemptStatus.Cancelled : PaymentAttemptStatus.Failed;
                    attempt.gatewayPayload = (parsed.payload as Record<string, unknown>) ?? {};
                    attempt.errorCode = parsed.status === "cancelled" ? "psp_cancelled" : "psp_failed";
                    await attempt.save();
                }
                if (order.status === OrderStatus.Pending) {
                    await orderStateMachine.transition(order, OrderStatus.Failed, {
                        reason: `payment.${gatewayCode}.${parsed.status}`,
                        trx,
                    });
                }
                return { order, attempt, redirect: this.attachReason(failedUrl, `psp_${parsed.status}`) };
            }

            /** Replayed callback for an already-verified attempt: no-op, return success URL. */
            if (attempt.status === PaymentAttemptStatus.Verified) {
                return { order, attempt, redirect: this.attachOrderKey(successUrl, order) };
            }

            const verifyResult = await adapter.verify!({
                attempt,
                callback: parsed,
                settings: (gateway.settings as Record<string, unknown>) ?? {},
            });

            /**
             * Amount guard: PSPs occasionally echo back a different amount than we sent (sandbox
             * weirdness or attacker tampering). Checked before the success branch so the
             * commit path stays single-track — verify-success-with-mismatch is treated as a
             * verify-failure with a tagged error code.
             */
            const amountMismatch =
                verifyResult.ok &&
                verifyResult.amount_minor !== undefined &&
                verifyResult.amount_minor !== Number(attempt.amountMinor);

            if (!verifyResult.ok || amountMismatch) {
                attempt.status = PaymentAttemptStatus.Failed;
                attempt.errorCode = amountMismatch ? "amount_mismatch" : (verifyResult as { error_code: string }).error_code;
                attempt.errorMessage = amountMismatch
                    ? `expected ${attempt.amountMinor}, got ${(verifyResult as { amount_minor: number }).amount_minor}`
                    : (verifyResult as { error_message: string }).error_message;
                attempt.gatewayPayload = (verifyResult.payload as Record<string, unknown>) ?? {};
                await attempt.save();
                if (order.status === OrderStatus.Pending) {
                    await orderStateMachine.transition(order, OrderStatus.Failed, {
                        reason: amountMismatch
                            ? `payment.${gatewayCode}.amount_mismatch`
                            : `payment.${gatewayCode}.verify_failed`,
                        trx,
                    });
                }
                return {
                    order,
                    attempt,
                    redirect: this.attachReason(failedUrl, amountMismatch ? "amount_mismatch" : "verify_failed"),
                };
            }

            attempt.status = PaymentAttemptStatus.Verified;
            attempt.gatewayTransactionId = verifyResult.transaction_id;
            attempt.verifiedAt = DateTime.utc();
            attempt.gatewayPayload = (verifyResult.payload as Record<string, unknown>) ?? {};
            await attempt.save();

            order.useTransaction(trx);
            order.transactionId = verifyResult.transaction_id;
            await order.save();

            if (order.status === OrderStatus.Pending) {
                await orderStateMachine.transition(order, OrderStatus.Processing, {
                    reason: "payment_verified",
                    trx,
                });
            }

            return { order, attempt, redirect: this.attachOrderKey(successUrl, order) };
        });

        if (result.attempt) {
            await this.linkLatest(result.order, result.attempt);
        }
        if (result.attempt?.status === PaymentAttemptStatus.Verified) {
            await emitter.emit("payment:verified", {
                orderId: Number(result.order.id),
                attemptId: Number(result.attempt.id),
                transactionId: result.attempt.gatewayTransactionId ?? "",
            });
        }
        return result;
    }

    /**
     * Call the adapter's `refund` if available. Phase 07 wires this in place of its placeholder
     * gateway stub. Returns `ok: false` (not throwing) when the gateway doesn't support refunds,
     * so partial-refund flows can fall through to manual reconciliation gracefully.
     */
    async refund(order: Order, amountMinor: number, reason?: string): Promise<PaymentRefundResult> {
        const attempt = await PaymentAttempt.query()
            .where("order_id", Number(order.id))
            .where("status", PaymentAttemptStatus.Verified)
            .orderBy("verified_at", "desc")
            .first();
        if (!attempt) {
            return { ok: false, error_code: "no_verified_attempt", error_message: "Order has no verified payment to refund" };
        }
        const { adapter, gateway } = await paymentAdapterRegistry.resolveForGatewayId(attempt.gatewayId);
        if (!adapter.refund || !adapter.capabilities.refunds) {
            return {
                ok: false,
                error_code: "refunds_unsupported",
                error_message: `Gateway "${gateway.code}" does not support refunds`,
            };
        }
        const result = await adapter.refund({
            attempt,
            amount_minor: amountMinor,
            reason,
            settings: (gateway.settings as Record<string, unknown>) ?? {},
        });
        return result;
    }

    private redirectUrlFromAttemptPayload(attempt: PaymentAttempt): string | null {
        const payload = attempt.gatewayPayload as Record<string, unknown> | null;
        const value = payload?.redirect_url ?? null;
        return typeof value === "string" ? value : null;
    }

    private async buildCallbackUrl(gatewayCode: string, _order: Order): Promise<string> {
        const base = await this.settings.get<string>("payments", "callback_base_url", DEFAULT_CALLBACK_BASE);
        return `${base.replace(/\/+$/, "")}/api/v1/payment/callback/${gatewayCode}`;
    }

    private attachReason(url: string, reason: string): string {
        try {
            const u = new URL(url);
            u.searchParams.set("reason", reason);
            return u.toString();
        } catch {
            const sep = url.includes("?") ? "&" : "?";
            return `${url}${sep}reason=${encodeURIComponent(reason)}`;
        }
    }

    private attachOrderKey(url: string, order: Order): string {
        try {
            const u = new URL(url);
            if (order.orderKey) u.searchParams.set("order_key", order.orderKey);
            return u.toString();
        } catch {
            const sep = url.includes("?") ? "&" : "?";
            return order.orderKey ? `${url}${sep}order_key=${encodeURIComponent(order.orderKey)}` : url;
        }
    }

    private async linkLatest(order: Order, attempt: PaymentAttempt): Promise<void> {
        if (!order || !attempt?.id) return;
        order.lastPaymentAttemptId = attempt.id;
        await order.save();
    }

    private errorCodeFromException(error: unknown): string {
        const message = (error as Error)?.message ?? "";
        if (/abort|timeout|TimeoutError/i.test(message) || (error as { name?: string })?.name === "TimeoutError") {
            return "gateway_timeout";
        }
        if (/ENETUNREACH|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(message)) {
            return "gateway_unreachable";
        }
        return "gateway_error";
    }
}

export const paymentService = new PaymentService();

declare module "@adonisjs/core/types" {
    interface EventsList {
        "payment:verified": { orderId: number; attemptId: number; transactionId: string };
    }
}
