import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const TicketsController = () => import("#controllers/admin/tickets_controller");
const TicketAgentsController = () => import("#controllers/admin/ticket_agents_controller");
const SupportController = () => import("#controllers/admin/support_controller");
const ChannelsController = () => import("#controllers/admin/channels_controller");

/**
 * Shop ticketing surface. All groups sit behind `auth` + `admin` (shop staff are `role=admin`
 * users); the per-conversation access tier (R5) and the support-admin gates are enforced inside the
 * controllers via the resolved support actor. Static collection routes (`/inboxes`, `/canned`,
 * `/agents`, `/tags`) are registered before `/:id` so they win the match.
 */
router
    .group(() => {
        router.get("/", [TicketsController, "index"]).as("admin.tickets.index");
        router.get("/inboxes", [TicketsController, "inboxes"]).as("admin.tickets.inboxes.index");
        router.post("/inboxes", [TicketsController, "storeInbox"]).as("admin.tickets.inboxes.store");

        router.get("/canned", [TicketAgentsController, "cannedIndex"]).as("admin.tickets.canned.index");
        router.post("/canned", [TicketAgentsController, "cannedStore"]).as("admin.tickets.canned.store");
        router.patch("/canned/:id", [TicketAgentsController, "cannedUpdate"]).as("admin.tickets.canned.update");

        router.get("/agents", [TicketAgentsController, "agentsIndex"]).as("admin.tickets.agents.index");
        router.post("/agents", [TicketAgentsController, "agentsStore"]).as("admin.tickets.agents.store");
        router.patch("/agents/:id", [TicketAgentsController, "agentsUpdate"]).as("admin.tickets.agents.update");

        router.get("/tags", [TicketAgentsController, "tagsIndex"]).as("admin.tickets.tags.index");
        router.post("/tags", [TicketAgentsController, "tagsStore"]).as("admin.tickets.tags.store");
        router.delete("/tags/:id", [TicketAgentsController, "tagsDestroy"]).as("admin.tickets.tags.destroy");

        router.get("/:id", [TicketsController, "show"]).as("admin.tickets.show");
        router.post("/:id/messages", [TicketsController, "storeMessage"]).as("admin.tickets.messages.store");
        router.patch("/:id", [TicketsController, "update"]).as("admin.tickets.update");
        router.post("/:id/tags", [TicketsController, "addTag"]).as("admin.tickets.tags.attach");
        router.delete("/:id/tags/:tagId", [TicketsController, "removeTag"]).as("admin.tickets.tags.detach");
    })
    .prefix("/api/v1/admin/tickets")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());

router
    .group(() => {
        router.get("/", [SupportController, "index"]).as("admin.support.index");
        router.post("/", [SupportController, "store"]).as("admin.support.store");
        router.get("/:id", [SupportController, "show"]).as("admin.support.show");
        router.post("/:id/messages", [SupportController, "storeMessage"]).as("admin.support.messages.store");
    })
    .prefix("/api/v1/admin/support")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());

router
    .group(() => {
        router.post("/:provider/connect", [ChannelsController, "connect"]).as("admin.channels.connect");
        router.post("/:provider/:id/verify", [ChannelsController, "verify"]).as("admin.channels.verify");
        router.post("/:provider/:id/disconnect", [ChannelsController, "disconnect"]).as("admin.channels.disconnect");
    })
    .prefix("/api/v1/admin/channels")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
