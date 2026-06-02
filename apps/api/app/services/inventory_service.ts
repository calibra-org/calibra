import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import InventoryItem from "#models/inventory_item";
import InventoryMovement from "#models/inventory_movement";
import { recordInventoryMovement, recordInventoryOversellAttempt } from "#services/metrics/domain_metrics";
import { withTenantTransaction } from "#services/tenant_context";

/** Source-system that triggered an inventory movement; recorded on the ledger row. */
export type InventoryRefKind = "order" | "refund" | "manual";

/** Discriminator for `inventory_movements.kind`. */
export type InventoryMovementKind = "sale" | "return" | "restock" | "adjustment" | "reservation" | "release";

export interface InventoryRef {
    kind: InventoryRefKind;
    id: bigint | number | null;
}

export interface InventoryTarget {
    productId: bigint | number;
    variationId?: bigint | number | null;
}

export interface InventorySnapshot {
    stock: number;
    status: "instock" | "outofstock" | "onbackorder";
    manageStock: boolean;
}

/**
 * Concurrency-safe inventory ledger. Every reserve/release/decrement/increment writes one row to
 * `inventory_movements` AND mutates the matching `inventory_items.stock_quantity` inside a single
 * `withTenantTransaction()` that locks the row with `SELECT … FOR UPDATE`. Two concurrent reserves on the
 * same product/variation serialize cleanly — no double-spend.
 *
 * `manage_stock=false` makes every mutation a no-op (still snapshot-able). `backorders='no'`
 * refuses any decrement that would drive `stock_quantity` below 0.
 *
 * When the target variation row has `manage_stock_mode='parent'`, the resolver walks up to the
 * parent product's inventory row and operates there instead — the variation defers stock to its
 * parent (e.g. a clothing item with one-stock-pool-per-style).
 */
export default class InventoryService {
    async reserve(target: InventoryTarget, quantity: number, ref: InventoryRef, trx?: TransactionClientContract): Promise<void> {
        await this.mutate(target, "reservation", -Math.abs(quantity), ref, trx);
    }

    async release(target: InventoryTarget, quantity: number, ref: InventoryRef, trx?: TransactionClientContract): Promise<void> {
        await this.mutate(target, "release", Math.abs(quantity), ref, trx);
    }

    async decrement(
        target: InventoryTarget,
        quantity: number,
        ref: InventoryRef,
        trx?: TransactionClientContract,
    ): Promise<void> {
        await this.mutate(target, "sale", -Math.abs(quantity), ref, trx);
    }

    async increment(
        target: InventoryTarget,
        quantity: number,
        ref: InventoryRef,
        trx?: TransactionClientContract,
    ): Promise<void> {
        await this.mutate(target, "restock", Math.abs(quantity), ref, trx);
    }

    async snapshot(target: InventoryTarget): Promise<InventorySnapshot> {
        const item = await this.resolveItem(target);
        if (!item) {
            return { stock: 0, status: "outofstock", manageStock: false };
        }
        return {
            stock: item.stockQuantity,
            status: item.stockStatus as InventorySnapshot["status"],
            manageStock: item.manageStock,
        };
    }

    private async resolveItem(target: InventoryTarget) {
        let variationId = target.variationId ?? null;
        if (variationId !== null) {
            const variationRow = await db.from("product_variations").where("id", String(variationId)).first();
            if (variationRow?.manage_stock_mode === "parent") {
                variationId = null;
            }
        }
        return InventoryItem.query()
            .where("product_id", String(target.productId))
            .where((q) => {
                if (variationId === null) q.whereNull("variation_id");
                else q.where("variation_id", String(variationId));
            })
            .first();
    }

    private async mutate(
        target: InventoryTarget,
        kind: InventoryMovementKind,
        delta: number,
        ref: InventoryRef,
        externalTrx?: TransactionClientContract,
    ) {
        /**
         * When the caller already owns a transaction (e.g. the order finalizer wrapping the entire
         * draft → pending flow) the mutation joins it so a rollback unwinds the stock change. With
         * no caller trx the service opens its own — the original single-op contract.
         */
        const run = async (trx: TransactionClientContract): Promise<void> => {
            const item = await this.resolveItemForUpdate(target, trx);
            if (!item) {
                throw new InventoryItemMissingError(target);
            }

            if (!item.manageStock) {
                return;
            }

            const nextStock = item.stockQuantity + delta;
            if (nextStock < 0 && item.backorders === "no" && delta < 0) {
                recordInventoryOversellAttempt();
                throw new InsufficientStockError(target, item.stockQuantity, Math.abs(delta));
            }

            item.useTransaction(trx);
            item.stockQuantity = nextStock;
            item.stockStatus = computeStatus(nextStock, item.backorders);
            /**
             * Cache invariant: `stock_status` is intentionally NOT cached anywhere today (see
             * the "never cache" list in apps/api/AGENTS.md — oversell risk). If a future caller
             * starts caching the storefront's stock indicator, this is the spot to call
             * `CacheInvalidation.productChanged(item.productId)` so the cached value can't
             * drift behind a sold-out flip.
             */
            await item.save();

            const movement = new InventoryMovement();
            movement.useTransaction(trx);
            movement.inventoryItemId = item.id;
            movement.kind = kind;
            movement.quantityDelta = delta;
            movement.refKind = ref.kind;
            movement.refId = ref.id ?? null;
            await movement.save();
            recordInventoryMovement(kind);
        };

        if (externalTrx) {
            await run(externalTrx);
        } else {
            await withTenantTransaction(run);
        }
    }

    private async resolveItemForUpdate(target: InventoryTarget, trx: TransactionClientContract) {
        let variationId = target.variationId ?? null;
        if (variationId !== null) {
            const variationRow = await trx.from("product_variations").where("id", String(variationId)).first();
            if (variationRow?.manage_stock_mode === "parent") {
                variationId = null;
            }
        }
        const item = await InventoryItem.query({ client: trx })
            .where("product_id", String(target.productId))
            .where((q) => {
                if (variationId === null) q.whereNull("variation_id");
                else q.where("variation_id", String(variationId));
            })
            .forUpdate()
            .first();
        return item ?? null;
    }
}

function computeStatus(stock: number, backorders: string): InventorySnapshot["status"] {
    if (stock > 0) return "instock";
    if (backorders === "yes" || backorders === "notify") return "onbackorder";
    return "outofstock";
}

/** Thrown by every mutation when no row matches the target. Lives here so tests can `instanceof`. */
export class InventoryItemMissingError extends Error {
    constructor(target: InventoryTarget) {
        super(`No inventory_items row for product=${target.productId} variation=${target.variationId ?? "null"}`);
        this.name = "InventoryItemMissingError";
    }
}

/** Thrown when a decrement would drive stock below zero while `backorders='no'`. */
export class InsufficientStockError extends Error {
    constructor(target: InventoryTarget, available: number, requested: number) {
        super(
            `Insufficient stock for product=${target.productId} variation=${target.variationId ?? "null"}: available=${available}, requested=${requested}`,
        );
        this.name = "InsufficientStockError";
    }
}
