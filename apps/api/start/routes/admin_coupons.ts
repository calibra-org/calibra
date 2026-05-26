import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCouponsController = () => import("#controllers/admin/coupons_controller");

router
    .group(() => {
        router.get("/", [AdminCouponsController, "index"]).as("admin.coupons.index");
        router.get("/counts", [AdminCouponsController, "counts"]).as("admin.coupons.counts");
        router.get("/code-check", [AdminCouponsController, "codeCheck"]).as("admin.coupons.codeCheck");
        router.get("/export", [AdminCouponsController, "exportCsv"]).as("admin.coupons.export");
        router.post("/", [AdminCouponsController, "store"]).as("admin.coupons.store");
        router.post("/batch", [AdminCouponsController, "batch"]).as("admin.coupons.batch");
        router.get("/:id", [AdminCouponsController, "show"]).as("admin.coupons.show");
        router.put("/:id", [AdminCouponsController, "update"]).as("admin.coupons.update");
        router.patch("/:id", [AdminCouponsController, "update"]).as("admin.coupons.patch");
        router.delete("/:id", [AdminCouponsController, "destroy"]).as("admin.coupons.destroy");
        router.get("/:id/redemptions", [AdminCouponsController, "redemptions"]).as("admin.coupons.redemptions");
        router.post("/:id/test", [AdminCouponsController, "test"]).as("admin.coupons.test");
    })
    .prefix("/api/v1/admin/coupons")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
