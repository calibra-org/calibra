import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminMediaController = () => import("#controllers/admin/media_controller");

/**
 * Media library admin endpoints. Locked behind `auth` + `admin`; matches the convention used by
 * the orders / coupons / customers routes (the catalog routes are an existing oversight tracked
 * separately).
 *
 * The `/months` collection route sits above the `/:id` show route so the parameter binding
 * doesn't greedily catch the literal segment.
 */
router
    .group(() => {
        router.get("/", [AdminMediaController, "index"]).as("admin.media.index");
        router.get("/months", [AdminMediaController, "months"]).as("admin.media.months");
        router.post("/", [AdminMediaController, "store"]).as("admin.media.store");
        router.get("/:id", [AdminMediaController, "show"]).as("admin.media.show");
        router.patch("/:id", [AdminMediaController, "update"]).as("admin.media.update");
        router.delete("/:id", [AdminMediaController, "destroy"]).as("admin.media.destroy");
    })
    .prefix("/api/v1/admin/media")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
