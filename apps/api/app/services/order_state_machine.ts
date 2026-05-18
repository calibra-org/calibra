import { Exception } from "@adonisjs/core/exceptions";
import emitter from "@adonisjs/core/services/emitter";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import { findTransition, type OrderStatus, type OrderTransitionEffect } from "#enums/order_status";
import type Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import OrderStatusHistory from "#models/order_status_history";
import type User from "#models/user";
import InventoryService, { type InventoryTarget } from "#services/inventory_service";

export interface TransitionOptions {
    /** Authenticated actor responsible for the transition; recorded on the audit row. */
    actor?: User | null;
    /** Free-text justification, written verbatim to `order_status_history.reason`. */
    reason?: string | null;
    /** When supplied, the transition runs inside the caller's transaction (no new one is opened). */
    trx?: TransactionClientContract;
}

/**
 * State-machine gatekeeper for order transitions. Every status change goes through
 * `transition()` — controllers never poke `order.status` directly. Inside one transaction:
 * 1. Validate the (from, to) pair against the transition table.
 * 2. Run the named side effects (stock reserve/restore, paid/completed stamps, downloads grant).
 * 3. Update `orders.status` (and any per-effect timestamp).
 * 4. Append the `order_status_history` audit row.
 * 5. Emit the matching domain event for any registered listener.
 *
 * Throws a localized 422 on illegal transitions — exposes the rule, not the internals.
 */
export class OrderStateMachine {
    constructor(private readonly inventory = new InventoryService()) {}

    canTransition(from: OrderStatus, to: OrderStatus): boolean {
        return findTransition(from, to) !== null;
    }

    async transition(order: Order, to: OrderStatus, opts: TransitionOptions = {}): Promise<void> {
        const fromStatus = order.status;
        const transition = findTransition(fromStatus, to);
        if (!transition) {
            throw new Exception(`Illegal order status transition: ${fromStatus} → ${to}`, {
                status: 422,
                code: "E_ILLEGAL_ORDER_TRANSITION",
            });
        }

        const run = async (trx: TransactionClientContract): Promise<void> => {
            order.useTransaction(trx);

            for (const effect of transition.effects) {
                await this.applySideEffect(effect, order, trx);
            }

            order.status = to;
            await order.save();

            const history = new OrderStatusHistory();
            history.useTransaction(trx);
            history.orderId = order.id;
            history.fromStatus = fromStatus;
            history.toStatus = to;
            history.changedByUserId = opts.actor?.id ?? null;
            history.reason = opts.reason ?? null;
            history.occurredAt = DateTime.utc();
            await history.save();
        };

        if (opts.trx) {
            await run(opts.trx);
        } else {
            await db.transaction(run);
        }

        /**
         * Events fire after commit so listeners observe persisted state. Specific listeners are
         * registered as later phases need them (email queue, search index, …); the events cost
         * nothing on their own.
         */
        await emitter.emit("order:status_changed", { order, from: fromStatus, to });
        if (to === "pending" && fromStatus === "draft") {
            await emitter.emit("order:placed", { order });
        }
        if (to === "completed") {
            await emitter.emit("order:completed", { order });
        }
    }

    private async applySideEffect(effect: OrderTransitionEffect, order: Order, trx: TransactionClientContract): Promise<void> {
        switch (effect) {
            case "reserve_stock":
                await this.reserveStock(order, trx);
                return;
            case "restore_stock":
                await this.restoreStock(order, trx);
                return;
            case "set_paid_at":
                order.datePaidAt = DateTime.utc();
                return;
            case "set_completed_at":
                order.dateCompletedAt = DateTime.utc();
                return;
            case "grant_downloads":
                /**
                 * Downloadable grants ledger (`customer_downloads`) is owned by phase 03; granting
                 * lives in a later phase that ties downloads to the gateway-confirmed paid event.
                 * Stub left in place so the state-machine reads cleanly; expanding it is purely
                 * additive.
                 */
                return;
        }
    }

    private async reserveStock(order: Order, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderLineItem.query({ client: trx }).where("order_id", Number(order.id));
        for (const line of lines) {
            if (!line.productId) continue;
            const target: InventoryTarget = {
                productId: line.productId,
                variationId: line.variationId,
            };
            await this.inventory.reserve(target, line.quantity, { kind: "order", id: order.id }, trx);
        }
    }

    private async restoreStock(order: Order, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderLineItem.query({ client: trx }).where("order_id", Number(order.id));
        for (const line of lines) {
            if (!line.productId) continue;
            const target: InventoryTarget = {
                productId: line.productId,
                variationId: line.variationId,
            };
            await this.inventory.release(target, line.quantity, { kind: "order", id: order.id }, trx);
        }
    }
}

export const orderStateMachine = new OrderStateMachine();

declare module "@adonisjs/core/types" {
    interface EventsList {
        "order:placed": { order: Order };
        "order:status_changed": { order: Order; from: OrderStatus; to: OrderStatus };
        "order:completed": { order: Order };
    }
}
