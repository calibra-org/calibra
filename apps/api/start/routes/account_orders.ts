import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AccountOrdersController = () => import("#controllers/account/orders_controller");

router
    .group(() => {
        router.get("/", [AccountOrdersController, "index"]).as("account.orders.index");
        router.get("/:id", [AccountOrdersController, "show"]).as("account.orders.show");
    })
    .prefix("/api/v1/account/orders")
    .use(middleware.auth({ guards: ["api"] }));
