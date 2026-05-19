import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AccountOrdersController = () => import("#controllers/account/orders_controller");
const AccountOrderNotesController = () => import("#controllers/account/order_notes_controller");
const AccountOrderHistoryController = () => import("#controllers/account/order_history_controller");

router
    .group(() => {
        router.get("/", [AccountOrdersController, "index"]).as("account.orders.index");
        router.get("/:id", [AccountOrdersController, "show"]).as("account.orders.show");
        router.get("/:id/notes", [AccountOrderNotesController, "index"]).as("account.orders.notes.index");
        router.get("/:id/history", [AccountOrderHistoryController, "index"]).as("account.orders.history.index");
    })
    .prefix("/api/v1/account/orders")
    .use(middleware.auth({ guards: ["api"] }));
