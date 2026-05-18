import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import InventoryItem from "#models/inventory_item";
import InventoryMovement from "#models/inventory_movement";
import Product from "#models/product";
import ProductTranslation from "#models/product_translation";
import InventoryService, { InsufficientStockError } from "#services/inventory_service";

async function createProductWithInventory(opts: { stock: number; backorders?: "no" | "yes" | "notify"; manageStock?: boolean }) {
    const product = await Product.create({
        type: "simple",
        sku: `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: "publish",
        catalogVisibility: "visible",
        regularPrice: 1_000_000,
        taxStatus: "taxable",
        menuOrder: 0,
        attributes: {},
    });
    await ProductTranslation.create({
        productId: product.id,
        locale: "fa",
        name: `inv-${product.id}`,
        slug: `inv-${product.id}`,
    });
    const item = await InventoryItem.create({
        productId: product.id,
        variationId: null,
        locationId: null,
        stockQuantity: opts.stock,
        manageStock: opts.manageStock ?? true,
        backorders: opts.backorders ?? "no",
        stockStatus: opts.stock > 0 ? "instock" : "outofstock",
    });
    return { product, item };
}

test.group("InventoryService", (group) => {
    group.each.setup(async () => {
        const cleanup = await testUtils.db().truncate();
        return cleanup;
    });

    test("reserve appends a ledger row and decrements stock", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 10 });
        const svc = new InventoryService();
        await svc.reserve({ productId: product.id }, 3, { kind: "order", id: 999 });

        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, 7);

        const movements = await InventoryMovement.query().where("inventory_item_id", String(item.id));
        assert.equal(movements.length, 1);
        assert.equal(movements[0]?.kind, "reservation");
        assert.equal(movements[0]?.quantityDelta, -3);
        assert.equal(movements[0]?.refKind, "order");
    });

    test("release reverses a previous reservation", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 10 });
        const svc = new InventoryService();
        await svc.reserve({ productId: product.id }, 3, { kind: "order", id: 1 });
        await svc.release({ productId: product.id }, 3, { kind: "order", id: 1 });

        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, 10);

        const movements = await InventoryMovement.query().where("inventory_item_id", String(item.id));
        assert.equal(movements.length, 2);
    });

    test("decrement past zero with backorders=no throws InsufficientStockError", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 2, backorders: "no" });
        const svc = new InventoryService();
        await assert.rejects(() => svc.decrement({ productId: product.id }, 5, { kind: "order", id: 1 }), InsufficientStockError);
        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, 2);
    });

    test("decrement past zero with backorders=yes succeeds", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 2, backorders: "yes" });
        const svc = new InventoryService();
        await svc.decrement({ productId: product.id }, 5, { kind: "order", id: 1 });
        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, -3);
        assert.equal(refreshed.stockStatus, "onbackorder");
    });

    test("manage_stock=false makes mutations a no-op", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 5, manageStock: false });
        const svc = new InventoryService();
        await svc.reserve({ productId: product.id }, 3, { kind: "order", id: 1 });
        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, 5);
        const movements = await InventoryMovement.query().where("inventory_item_id", String(item.id));
        assert.equal(movements.length, 0);
    });

    test("concurrent reserves on the same item serialize (no double-spend)", async ({ assert }) => {
        const { product, item } = await createProductWithInventory({ stock: 5, backorders: "no" });
        const svc = new InventoryService();

        const results = await Promise.allSettled([
            svc.reserve({ productId: product.id }, 3, { kind: "order", id: 1 }),
            svc.reserve({ productId: product.id }, 3, { kind: "order", id: 2 }),
        ]);

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const rejected = results.filter((r) => r.status === "rejected").length;
        assert.equal(succeeded, 1, "exactly one reserve should succeed");
        assert.equal(rejected, 1, "exactly one reserve should fail with InsufficientStockError");

        const refreshed = await InventoryItem.findOrFail(item.id);
        assert.equal(refreshed.stockQuantity, 2);
    });

    test("snapshot returns current stock and status", async ({ assert }) => {
        const { product } = await createProductWithInventory({ stock: 7 });
        const svc = new InventoryService();
        const snap = await svc.snapshot({ productId: product.id });
        assert.equal(snap.stock, 7);
        assert.equal(snap.status, "instock");
        assert.isTrue(snap.manageStock);
    });
});
