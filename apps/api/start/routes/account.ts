import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const MeController = () => import("#controllers/account/me_controller");
const AddressesController = () => import("#controllers/account/addresses_controller");
const DownloadsController = () => import("#controllers/account/downloads_controller");

router
    .group(() => {
        router.get("/me", [MeController, "show"]).as("account.me.show");
        router.put("/me", [MeController, "update"]).as("account.me.update");

        router.get("/addresses", [AddressesController, "index"]).as("account.addresses.index");
        router.post("/addresses", [AddressesController, "store"]).as("account.addresses.store");
        router.get("/addresses/:id", [AddressesController, "show"]).as("account.addresses.show");
        router.patch("/addresses/:id", [AddressesController, "update"]).as("account.addresses.update");
        router.delete("/addresses/:id", [AddressesController, "destroy"]).as("account.addresses.destroy");

        router.get("/downloads", [DownloadsController, "index"]).as("account.downloads.index");
        router.get("/downloads/:id/url", [DownloadsController, "url"]).as("account.downloads.url");
    })
    .prefix("/api/v1/account")
    .use(middleware.auth({ guards: ["api"] }));
