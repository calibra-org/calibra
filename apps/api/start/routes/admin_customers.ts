import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomersController = () => import("#controllers/admin/customers_controller");

router
    .group(() => {
        router.get("/", [AdminCustomersController, "index"]).as("admin.customers.index");
        router.get("/counts", [AdminCustomersController, "counts"]).as("admin.customers.counts");
        router.post("/", [AdminCustomersController, "store"]).as("admin.customers.store");
        router.post("/batch", [AdminCustomersController, "batch"]).as("admin.customers.batch");
        router.get("/:id", [AdminCustomersController, "show"]).as("admin.customers.show");
        router.put("/:id", [AdminCustomersController, "update"]).as("admin.customers.update");
        router.patch("/:id", [AdminCustomersController, "update"]).as("admin.customers.patch");
        router.delete("/:id", [AdminCustomersController, "destroy"]).as("admin.customers.destroy");
        router.post("/:id/restore", [AdminCustomersController, "restore"]).as("admin.customers.restore");
        router.get("/:id/stats", [AdminCustomersController, "stats"]).as("admin.customers.stats");
        router.get("/:id/downloads", [AdminCustomersController, "downloads"]).as("admin.customers.downloads");
    })
    .prefix("/api/v1/admin/customers")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
