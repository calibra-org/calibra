import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminSettingsGeneralController = () => import("#controllers/admin/settings_general_controller");
const AdminSettingsDatetimeController = () => import("#controllers/admin/settings_datetime_controller");

router
    .group(() => {
        router.get("/general", [AdminSettingsGeneralController, "show"]).as("admin.settings.general.show");
        router.patch("/general", [AdminSettingsGeneralController, "update"]).as("admin.settings.general.update");
        router.get("/datetime", [AdminSettingsDatetimeController, "show"]).as("admin.settings.datetime.show");
        router.patch("/datetime", [AdminSettingsDatetimeController, "update"]).as("admin.settings.datetime.update");
    })
    .prefix("/api/v1/admin/settings")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
