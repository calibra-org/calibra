import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminOperatorsController = () => import("#controllers/admin/operators_controller");

/**
 * Tenant self-service operator management (Settings ▸ Team). Same `auth` + `admin` chain as the rest
 * of the admin surface; owner-only enforcement + impersonation denylist live in the controller.
 */
router
    .group(() => {
        router.get("/", [AdminOperatorsController, "index"]).as("admin.operators.index");
        router.post("/", [AdminOperatorsController, "store"]).as("admin.operators.store");
        router.patch("/:id/disable", [AdminOperatorsController, "disable"]).as("admin.operators.disable");
        router.patch("/:id/enable", [AdminOperatorsController, "enable"]).as("admin.operators.enable");
        router.delete("/:id", [AdminOperatorsController, "destroy"]).as("admin.operators.destroy");
        router.post("/:id/reset-password", [AdminOperatorsController, "resetPassword"]).as("admin.operators.reset");
        router.post("/:id/handoff-link", [AdminOperatorsController, "handoffLink"]).as("admin.operators.handoff");
        router.post("/:id/make-owner", [AdminOperatorsController, "makeOwner"]).as("admin.operators.makeOwner");
    })
    .prefix("/api/v1/admin/operators")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
