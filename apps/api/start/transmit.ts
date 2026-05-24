import transmit from "@adonisjs/transmit/services/main";

import ProductExport from "#models/product_export";
import ProductImport from "#models/product_import";
import { middleware } from "#start/kernel";

/**
 * Server-Sent Events backbone — `@adonisjs/transmit` handles the HTTP plumbing, channel registry,
 * heartbeats, and lifecycle. We only define:
 *
 *   1. The Transmit HTTP routes (`/__transmit/{events,subscribe,unsubscribe}`), gated by the
 *      same `auth` middleware the rest of the admin API uses — an anonymous browser can't open an
 *      SSE channel.
 *   2. `authorize` callbacks for the `imports/:importId` and `exports/:exportId` channels —
 *      every subscribe attempt must own the row.
 *
 * Broadcasts happen from the runner side via `transmit.broadcast(`imports/${id}`, event)` etc.;
 * no `subscribe` plumbing lives in our controllers anymore.
 */

transmit.registerRoutes((route) => {
    /** Apply the same `api` guard chain the rest of the admin routes use. */
    route.use(middleware.auth({ guards: ["api"] }));
});

transmit.authorize<{ importId: string }>("imports/:importId", async (ctx, { importId }) => {
    const user = ctx.auth.user;
    if (user === undefined || user === null) return false;
    const row = await ProductImport.find(importId);
    return row !== null && Number(row.userId) === Number(user.id);
});

transmit.authorize<{ exportId: string }>("exports/:exportId", async (ctx, { exportId }) => {
    const user = ctx.auth.user;
    if (user === undefined || user === null) return false;
    const row = await ProductExport.find(exportId);
    return row !== null && Number(row.userId) === Number(user.id);
});
