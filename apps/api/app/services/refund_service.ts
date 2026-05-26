import { Exception } from "@adonisjs/core/exceptions";
import emitter from "@adonisjs/core/services/emitter";
import lock from "@adonisjs/lock/services/main";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import * as Sentry from "@sentry/node";
import { DateTime } from "luxon";

import { ResourceConflictException } from "#exceptions/domain_exceptions";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import OrderNote from "#models/order_note";
import OrderRefund from "#models/order_refund";
import OrderRefundLineItem from "#models/order_refund_line_item";
import type User from "#models/user";
import InventoryService from "#services/inventory_service";
import { orderStateMachine } from "#services/order_state_machine";
import { paymentService } from "#services/payment_service";

export interface RefundLineItemInput {
    orderLineItemId: number | bigint;
    quantity: number;
    refundAmountMinor?: number | null;
    refundTaxMinor?: number | null;
}

export interface RefundInput {
    amountMinor?: number | null;
    lineItems?: RefundLineItemInput[] | null;
    reason?: string | null;
    restockRequested?: boolean;
}

export interface RefundCreateOptions {
    actor?: User | null;
    idempotencyKey?: string | null;
}

/**
 * Issues refunds against an existing order. Every mutation runs inside a single transaction:
 *
 *  1. `SELECT … FOR UPDATE` on the order (so two parallel refund requests serialize).
 *  2. Idempotency-Key short-circuit — if a refund row with `(order_id, idempotency_key)` already
 *     exists, return it without re-issuing.
 *  3. Validate the request body: `amount_minor` XOR `line_items[]`, both > 0, both ≤ outstanding.
 *  4. Allocate the refund_number from `refund_number_seq`.
 *  5. Insert `order_refunds` + (optionally) `order_refund_line_items` rows.
 *  6. If `restock_requested` → call {@link InventoryService.increment} per refunded line.
 *  7. PSP refund hook — `paymentService.refund()` dispatches to the gateway adapter; failures are
 *     recorded on `attributes.gateway_refund` but do not block the booking.
 *  8. If `sum(refunds.amount_minor) >= order.grand_total` → transition the order to `refunded`.
 *  9. Append an internal audit note (`"Refund #{number} for {amount} {currency}. Reason: {reason}"`).
 * 10. Commit, then emit `order:refunded`.
 */
export class RefundService {
    constructor(private readonly inventory = new InventoryService()) {}

    async create(orderId: number | bigint, payload: RefundInput, opts: RefundCreateOptions = {}): Promise<OrderRefund> {
        const numericOrderId = Number(orderId);
        if (!Number.isFinite(numericOrderId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }

        /**
         * Order-scoped distributed lock. Serialises concurrent admin refunds AND any in-flight
         * `payment_service.verifyCallback` on the same order. The DB-level `FOR UPDATE` row lock
         * inside the transaction still applies (defence-in-depth); this lock gives a faster fail
         * path with a 409 instead of blocking on a transaction queue.
         */
        const [acquired, value] = await lock
            .createLock(`order:${numericOrderId}`, "30s")
            .runImmediately(() => this.createInsideLock(numericOrderId, payload, opts));
        if (!acquired) {
            throw new ResourceConflictException("order is being processed concurrently", {
                resource: "orders",
                id: numericOrderId,
                code: "E_CONCURRENT_PROCESSING",
            });
        }
        const { refund, customerId } = value;

        /** Fire after commit so listeners observe persisted state. */
        await emitter.emit("order:refunded", {
            orderId: Number(refund.orderId),
            refundId: Number(refund.id),
            amountMinor: Number(refund.amountMinor),
            customerId,
        });

        return refund;
    }

    /**
     * The inner half of `create`, run inside both the per-order `@adonisjs/lock` mutex and the
     * Lucid transaction. Pulled out so the public `create` keeps the lock + post-commit emit
     * shell readable.
     */
    private async createInsideLock(
        numericOrderId: number,
        payload: RefundInput,
        opts: RefundCreateOptions,
    ): Promise<{ refund: OrderRefund; customerId: number | null }> {
        return db.transaction(async (trx) => {
            /** Row-lock the order — concurrent refunds on the same order serialize here. */
            const orderRow = await trx.from("orders").where("id", numericOrderId).forUpdate().first();
            if (!orderRow) {
                throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            }
            const order = await Order.findOrFail(numericOrderId, { client: trx });

            if (opts.idempotencyKey) {
                const existing = await OrderRefund.query({ client: trx })
                    .where("order_id", numericOrderId)
                    .where("idempotency_key", opts.idempotencyKey)
                    .first();
                if (existing) {
                    await existing.load("lineItems");
                    return {
                        refund: existing,
                        customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                    };
                }
            }

            this.assertOrderRefundable(order);

            const hasAmount = payload.amountMinor !== undefined && payload.amountMinor !== null;
            const hasLines = (payload.lineItems?.length ?? 0) > 0;
            if (hasAmount === hasLines) {
                throw new Exception("Refund body must contain either amount_minor or line_items, never both", {
                    status: 422,
                    code: "E_REFUND_INPUT_INVALID",
                });
            }

            const priorTotal = await this.sumPriorRefundAmount(numericOrderId, trx);
            const grandTotal = Number(order.grandTotal);
            const outstanding = grandTotal - priorTotal;
            if (outstanding <= 0) {
                throw new Exception("Order has no remaining outstanding to refund", {
                    status: 422,
                    code: "E_REFUND_FULLY_REFUNDED",
                });
            }

            const lineInputs = hasLines ? (payload.lineItems as RefundLineItemInput[]) : [];
            const resolvedAmount = hasAmount ? (payload.amountMinor as number) : this.sumLineAmounts(lineInputs);

            if (resolvedAmount <= 0) {
                throw new Exception("Refund amount must be positive", {
                    status: 422,
                    code: "E_REFUND_AMOUNT_NONPOSITIVE",
                });
            }
            if (resolvedAmount > outstanding) {
                throw new Exception(`Refund exceeds remaining outstanding (${outstanding})`, {
                    status: 422,
                    code: "E_REFUND_EXCEEDS_OUTSTANDING",
                });
            }

            let lineTaxTotal = 0;
            if (hasLines) {
                await this.validateLineQuantities(numericOrderId, lineInputs, trx);
                for (const line of lineInputs) {
                    lineTaxTotal += Number(line.refundTaxMinor ?? 0);
                }
            }

            const refundNumber = await this.allocateRefundNumber(trx);
            const refund = new OrderRefund();
            refund.useTransaction(trx);
            refund.orderId = order.id;
            refund.refundNumber = refundNumber;
            refund.amountMinor = resolvedAmount;
            refund.taxAmountMinor = lineTaxTotal;
            refund.reason = payload.reason ?? null;
            refund.refundedByUserId = opts.actor?.id ?? null;
            refund.restockRequested = payload.restockRequested ?? false;
            refund.gatewayRefundId = null;
            refund.idempotencyKey = opts.idempotencyKey ?? null;
            refund.processedAt = DateTime.utc();
            refund.attributes = {};
            await refund.save();

            if (hasLines) {
                for (const line of lineInputs) {
                    await this.writeRefundLine(trx, refund.id, line);
                }
            }

            if (refund.restockRequested) {
                await this.restock(refund.id, numericOrderId, lineInputs, hasLines, trx);
            }

            await this.callGatewayRefund(order, refund, trx);

            const newPriorTotal = priorTotal + resolvedAmount;
            const fullyRefunded = newPriorTotal >= grandTotal;
            if (fullyRefunded) {
                await orderStateMachine.transition(order, OrderStatus.Refunded, {
                    actor: opts.actor ?? null,
                    reason: `Refund #${refundNumber}`,
                    trx,
                });
            }

            await this.writeAuditNote(trx, order, refund);

            return {
                refund,
                customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
            };
        });
    }

    /**
     * Sum every prior refund's `amount_minor` for the given order (uses raw SUM so we don't load
     * rows just to count their total). Called inside the same transaction as the new refund so the
     * tally reflects the locked state.
     */
    private async sumPriorRefundAmount(orderId: number, trx: TransactionClientContract): Promise<number> {
        const row = (await trx.from("order_refunds").where("order_id", orderId).sum({ sum: "amount_minor" }).first()) as
            | { sum: string | number | null }
            | undefined;
        return Number(row?.sum ?? 0);
    }

    /**
     * Sum the per-line amounts the caller declared on a line-item refund. Per-line amounts are
     * optional in the payload — when omitted, the line is assumed to be a zero-money line (only
     * useful for restock-only refunds; the service still requires the rolled-up refund amount > 0
     * so an all-zero payload 422s).
     */
    private sumLineAmounts(lines: RefundLineItemInput[]): number {
        let sum = 0;
        for (const line of lines) {
            sum += Number(line.refundAmountMinor ?? 0);
        }
        return sum;
    }

    /**
     * For each refunded line, verify it belongs to the order AND the requested quantity does not
     * exceed (source.quantity − sum(prior refund_line_items.quantity for that line)). Issues are
     * 422s so the admin client can surface them per-line in form errors.
     */
    private async validateLineQuantities(
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        for (const requested of lines) {
            const sourceId = Number(requested.orderLineItemId);
            const source = await OrderLineItem.query({ client: trx }).where("id", sourceId).where("order_id", orderId).first();
            if (!source) {
                throw new Exception(`Line item ${sourceId} does not belong to this order`, {
                    status: 422,
                    code: "E_REFUND_LINE_INVALID",
                });
            }
            const priorRow = (await trx
                .from("order_refund_line_items as rli")
                .innerJoin("order_refunds as r", "r.id", "rli.refund_id")
                .where("r.order_id", orderId)
                .where("rli.order_line_item_id", sourceId)
                .sum({ sum: "rli.quantity" })
                .first()) as { sum: string | number | null } | undefined;
            const priorQuantity = Number(priorRow?.sum ?? 0);
            const remaining = source.quantity - priorQuantity;
            if (requested.quantity > remaining) {
                throw new Exception(`Refund quantity ${requested.quantity} exceeds remaining ${remaining} for line ${sourceId}`, {
                    status: 422,
                    code: "E_REFUND_LINE_QUANTITY_EXCEEDS",
                });
            }
        }
    }

    private async writeRefundLine(
        trx: TransactionClientContract,
        refundId: bigint | number,
        line: RefundLineItemInput,
    ): Promise<void> {
        const row = new OrderRefundLineItem();
        row.useTransaction(trx);
        row.refundId = refundId;
        row.orderLineItemId = line.orderLineItemId;
        row.quantity = line.quantity;
        row.refundAmountMinor = Number(line.refundAmountMinor ?? 0);
        row.refundTaxMinor = Number(line.refundTaxMinor ?? 0);
        await row.save();
    }

    /**
     * Restock loop. Resolves each refunded line's source row to (product_id, variation_id, qty)
     * and calls {@link InventoryService.increment} with a `kind: 'return'` ref. `manage_stock=false`
     * targets are no-ops (the inventory service handles that internally), so this loop is safe to
     * run even for line items whose product isn't tracked.
     */
    private async restock(
        refundId: bigint | number,
        orderId: number,
        lines: RefundLineItemInput[],
        hasLines: boolean,
        trx: TransactionClientContract,
    ): Promise<void> {
        const sources = hasLines
            ? await Promise.all(
                  lines.map(async (l) => ({
                      line: await OrderLineItem.query({ client: trx })
                          .where("id", Number(l.orderLineItemId))
                          .where("order_id", orderId)
                          .first(),
                      quantity: l.quantity,
                  })),
              )
            : (await OrderLineItem.query({ client: trx }).where("order_id", orderId)).map((line) => ({
                  line,
                  quantity: line.quantity,
              }));

        for (const entry of sources) {
            const sourceLine = entry.line;
            if (!sourceLine?.productId) continue;
            await this.inventory.increment(
                {
                    productId: sourceLine.productId,
                    variationId: sourceLine.variationId,
                },
                entry.quantity,
                { kind: "refund", id: Number(refundId) },
                trx,
            );
        }
    }

    /**
     * PSP refund hook. Looks up the order's verified `payment_attempts` row and calls the
     * adapter's `refund()`. On success, persists the PSP-side identifier in
     * `refund.gateway_refund_id`. The whole chain is best-effort: adapter outage, "refunds
     * unsupported", or "no verified attempt" never blocks Calibra-side bookkeeping — the refund
     * row is the source of truth, and the failure detail rides on `attributes.gateway_refund` for
     * forensic replay later.
     *
     * Failures (return ok=false) are intentionally NOT re-thrown — for cod / bank_transfer
     * orders there's no PSP to refund against, and for redirect gateways an offline reconcile
     * is expected when the PSP is unreachable. Callers see the booking either way.
     */
    private async callGatewayRefund(order: Order, refund: OrderRefund, trx: TransactionClientContract): Promise<void> {
        try {
            const result = await paymentService.refund(order, Number(refund.amountMinor), refund.reason ?? undefined);
            refund.useTransaction(trx);
            if (result.ok && result.gateway_refund_id) {
                refund.gatewayRefundId = result.gateway_refund_id;
                refund.attributes = {
                    ...((refund.attributes as Record<string, unknown>) ?? {}),
                    gateway_refund: { ok: true, gateway_refund_id: result.gateway_refund_id },
                };
            } else {
                refund.attributes = {
                    ...((refund.attributes as Record<string, unknown>) ?? {}),
                    gateway_refund: { ok: false, error_code: result.error_code, error_message: result.error_message },
                };
                /**
                 * PSP refund didn't throw but came back !ok. Booking still proceeds (manual
                 * reconciliation later) so we surface the failure to error tracking — silent
                 * `ok: false` rows pile up unnoticed otherwise.
                 */
                Sentry.captureMessage("refund_psp_returned_failure", {
                    level: "warning",
                    tags: {
                        order_id: String(order.id),
                        refund_id: String(refund.id),
                        error_code: result.error_code ?? "unknown",
                    },
                    extra: { error_message: result.error_message },
                });
            }
            await refund.save();
        } catch (error) {
            refund.useTransaction(trx);
            refund.attributes = {
                ...((refund.attributes as Record<string, unknown>) ?? {}),
                gateway_refund: { ok: false, error_code: "exception", error_message: (error as Error).message ?? "unknown" },
            };
            await refund.save();
            /**
             * Caught here so the booking proceeds (and the refund row records the failure),
             * which means the global exception handler never sees it. Explicit capture so the
             * silent-failure path stays visible.
             */
            Sentry.captureException(error, {
                tags: { order_id: String(order.id), refund_id: String(refund.id), phase: "gateway_refund" },
            });
        }
    }

    private async writeAuditNote(trx: TransactionClientContract, order: Order, refund: OrderRefund): Promise<void> {
        const reasonSuffix = refund.reason ? ` Reason: ${refund.reason}.` : "";
        const note = new OrderNote();
        note.useTransaction(trx);
        note.orderId = order.id;
        note.body = `Refund #${refund.refundNumber} for ${Number(refund.amountMinor)} ${order.currencyDisplay}.${reasonSuffix}`;
        note.visibility = "internal";
        note.authorUserId = refund.refundedByUserId ?? null;
        note.attributes = { source: "refund_service", refund_id: Number(refund.id) };
        await note.save();
    }

    private async allocateRefundNumber(trx: TransactionClientContract): Promise<number> {
        const result = (await trx.rawQuery("SELECT nextval('refund_number_seq') as next")) as {
            rows?: Array<{ next: unknown }>;
        };
        return Number(result.rows?.[0]?.next ?? 0);
    }

    private assertOrderRefundable(order: Order): void {
        const status = order.status;
        if (status === OrderStatus.Refunded) {
            throw new Exception("Order is already fully refunded", {
                status: 409,
                code: "E_ORDER_ALREADY_REFUNDED",
            });
        }
        if (status === OrderStatus.Draft || status === OrderStatus.Cancelled || status === OrderStatus.Failed) {
            throw new Exception(`Cannot refund order in status '${status}'`, {
                status: 409,
                code: "E_ORDER_NOT_REFUNDABLE",
            });
        }
    }
}

export const refundService = new RefundService();

declare module "@adonisjs/core/types" {
    interface EventsList {
        "order:refunded": { orderId: number; refundId: number; amountMinor: number; customerId: number | null };
    }
}
