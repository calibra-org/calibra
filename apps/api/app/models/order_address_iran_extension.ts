import { OrderAddressIranExtensionSchema } from "#database/schema";

/**
 * Pattern 3 snapshot extension. Written by phase 05's order finalizer when snapshotting an Iran
 * address that carries fiscal-identifier fields. The model has no eager `belongsTo` to
 * `OrderAddress` because that table arrives in phase 05; the FK is added then.
 */
export default class OrderAddressIranExtension extends OrderAddressIranExtensionSchema {
    static table = "order_address_iran_extensions";
}
