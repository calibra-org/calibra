import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerNotesController = () => import("#controllers/admin/customer_notes_controller");

router
    .group(() => {
        router.get("/:customer_id/notes", [AdminCustomerNotesController, "index"]).as("admin.customers.notes.index");
        router.post("/:customer_id/notes", [AdminCustomerNotesController, "store"]).as("admin.customers.notes.store");
        router.patch("/:customer_id/notes/:id", [AdminCustomerNotesController, "update"]).as("admin.customers.notes.update");
        router.delete("/:customer_id/notes/:id", [AdminCustomerNotesController, "destroy"]).as("admin.customers.notes.destroy");
    })
    .prefix("/api/v1/admin/customers")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
