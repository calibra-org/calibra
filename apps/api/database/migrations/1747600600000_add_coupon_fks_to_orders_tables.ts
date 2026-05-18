import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Phase 05 created `order_coupon_lines.coupon_id` as a bare BIGINT (it deferred the FK until
 * `coupons` existed); phase 06 created `coupon_redemptions.order_id` the same way (orders didn't
 * exist yet). Now that both phases are merged, wire both FKs with RESTRICT — a coupon row referenced
 * by any historical order or redemption cannot be hard-deleted (soft-delete is the supported path).
 */
export default class extends BaseSchema {
    async up() {
        this.schema.raw(
            `ALTER TABLE "order_coupon_lines" ADD CONSTRAINT "order_coupon_lines_coupon_id_foreign" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT`,
        );
        this.schema.raw(
            `ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_foreign" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT`,
        );
    }

    async down() {
        this.schema.raw(`ALTER TABLE "coupon_redemptions" DROP CONSTRAINT IF EXISTS "coupon_redemptions_order_id_foreign"`);
        this.schema.raw(`ALTER TABLE "order_coupon_lines" DROP CONSTRAINT IF EXISTS "order_coupon_lines_coupon_id_foreign"`);
    }
}
