import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminSettingsGeneralController = () => import("#controllers/admin/settings_general_controller");

router
    .group(() => {
        router.get("/general", [AdminSettingsGeneralController, "show"]).as("admin.settings.general.show");
        router.patch("/general", [AdminSettingsGeneralController, "update"]).as("admin.settings.general.update");
    })
    .prefix("/api/v1/admin/settings")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
