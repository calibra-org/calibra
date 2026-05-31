import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminSettingsGeneralController = () => import("#controllers/admin/settings_general_controller");
const AdminSettingsDatetimeController = () => import("#controllers/admin/settings_datetime_controller");
const AdminSettingsMediaController = () => import("#controllers/admin/settings_media_controller");

router
    .group(() => {
        router.get("/general", [AdminSettingsGeneralController, "show"]).as("admin.settings.general.show");
        router.patch("/general", [AdminSettingsGeneralController, "update"]).as("admin.settings.general.update");
        router.get("/datetime", [AdminSettingsDatetimeController, "show"]).as("admin.settings.datetime.show");
        router.patch("/datetime", [AdminSettingsDatetimeController, "update"]).as("admin.settings.datetime.update");
        router.get("/media", [AdminSettingsMediaController, "show"]).as("admin.settings.media.show");
        router.patch("/media", [AdminSettingsMediaController, "update"]).as("admin.settings.media.update");
    })
    .prefix("/api/v1/admin/settings")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
