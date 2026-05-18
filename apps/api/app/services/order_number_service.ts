import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

/**
 * Wrapper around the `order_number_seq` Postgres sequence (ADR D4). Sequence advances are serial
 * at the engine level — two concurrent `nextval()` calls cannot return the same value — so the
 * allocator needs no locking on our side.
 *
 * The sequence is independent of `orders.id`, so `id` stays opaque (security) and `order_number`
 * stays compact and gap-free for customer support.
 */
export class OrderNumberService {
    async allocate(trx?: TransactionClientContract): Promise<number> {
        const client = trx ?? db;
        const result = await client.rawQuery("SELECT nextval('order_number_seq') as next");
        const row = Array.isArray(result) ? result[0]?.[0] : (result as { rows?: Array<{ next: unknown }> }).rows?.[0];
        const raw = row?.next;
        if (raw === undefined || raw === null) {
            throw new Error("order_number_seq returned no value");
        }
        return Number(raw);
    }
}

export const orderNumberService = new OrderNumberService();
