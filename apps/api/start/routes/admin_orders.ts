import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminOrdersController = () => import("#controllers/admin/orders_controller");
const AdminOrderEditController = () => import("#controllers/admin/order_edit_controller");

router
    .group(() => {
        router.get("/", [AdminOrdersController, "index"]).as("admin.orders.index");
        router.get("/counts", [AdminOrdersController, "counts"]).as("admin.orders.counts");
        router.post("/", [AdminOrdersController, "store"]).as("admin.orders.store");
        router.post("/batch", [AdminOrdersController, "batch"]).as("admin.orders.batch");
        router.get("/:id", [AdminOrdersController, "show"]).as("admin.orders.show");
        router.patch("/:id", [AdminOrdersController, "update"]).as("admin.orders.update");
        router.put("/:id", [AdminOrdersController, "update"]).as("admin.orders.put");
        router.delete("/:id", [AdminOrdersController, "destroy"]).as("admin.orders.destroy");
        router.post("/:id/status", [AdminOrdersController, "transitionStatus"]).as("admin.orders.status");
        router.post("/:id/mark-shipped", [AdminOrdersController, "markShipped"]).as("admin.orders.markShipped");
        router
            .post("/:id/resend-confirmation", [AdminOrdersController, "resendConfirmation"])
            .as("admin.orders.resendConfirmation");

        /** Order editor surface — addresses, line items, fees, shipping, coupons, header, recalc, meta, stats. */
        router.patch("/:id/addresses/:kind", [AdminOrderEditController, "updateAddress"]).as("admin.orders.address.update");
        router.post("/:id/line-items", [AdminOrderEditController, "createLineItem"]).as("admin.orders.lineItems.create");
        router.patch("/:id/line-items/:lineId", [AdminOrderEditController, "updateLineItem"]).as("admin.orders.lineItems.update");
        router.delete("/:id/line-items/:lineId", [AdminOrderEditController, "deleteLineItem"]).as("admin.orders.lineItems.delete");
        router.post("/:id/fee-lines", [AdminOrderEditController, "createFee"]).as("admin.orders.fees.create");
        router.delete("/:id/fee-lines/:feeId", [AdminOrderEditController, "deleteFee"]).as("admin.orders.fees.delete");
        router.post("/:id/shipping-lines", [AdminOrderEditController, "createShippingLine"]).as("admin.orders.shippingLines.create");
        router
            .patch("/:id/shipping-lines/:lineId", [AdminOrderEditController, "updateShippingLine"])
            .as("admin.orders.shippingLines.update");
        router
            .delete("/:id/shipping-lines/:lineId", [AdminOrderEditController, "deleteShippingLine"])
            .as("admin.orders.shippingLines.delete");
        router.post("/:id/coupons", [AdminOrderEditController, "applyCoupon"]).as("admin.orders.coupons.apply");
        router.delete("/:id/coupons/:code", [AdminOrderEditController, "removeCoupon"]).as("admin.orders.coupons.remove");
        router.post("/:id/recalculate-totals", [AdminOrderEditController, "recalculateTotals"]).as("admin.orders.recalculate");
        router.patch("/:id/header", [AdminOrderEditController, "updateHeader"]).as("admin.orders.header.update");
        router.patch("/:id/meta", [AdminOrderEditController, "upsertMeta"]).as("admin.orders.meta.upsert");
        router.delete("/:id/meta/:key", [AdminOrderEditController, "deleteMeta"]).as("admin.orders.meta.delete");
        router.get("/:id/customer-stats", [AdminOrderEditController, "customerStats"]).as("admin.orders.customerStats");
    })
    .prefix("/api/v1/admin/orders")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
