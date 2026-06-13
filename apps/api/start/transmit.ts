import transmit from "@adonisjs/transmit/services/main";

import ProductExport from "#models/product_export";
import ProductImport from "#models/product_import";
import TicketingAgent from "#models/ticketing_agent";
import TicketingConversation from "#models/ticketing_conversation";
import { setSseClients } from "#services/metrics/domain_metrics";
import { applyAgentScope } from "#services/ticketing/agent_access";
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
 *   3. Subscribe / unsubscribe metric hooks — the per-channel-root subscriber gauge
 *      (`calibra_sse_clients`) ticks up on subscribe and down on unsubscribe so the dashboard can
 *      surface "operators currently watching this import run" without polling.
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

/**
 * A shop agent may subscribe to a conversation only if their access tier (R5) admits it AND the
 * conversation is in their tenant (RLS scopes the query to `app.current_tenant`, set by
 * `tenant_context_middleware` from the admin BFF's header). Read-only — never auto-creates an agent.
 * Storefront/customer + platform-operator subscription is phase 2.
 */
transmit.authorize<{ id: string }>("ticketing/conversations/:id", async (ctx, { id }) => {
    const user = ctx.auth.user;
    if (user === undefined || user === null) return false;
    const agent = await TicketingAgent.query().where("user_id", Number(user.id)).first();
    const accessTier = agent ? agent.accessTier : user.role === "admin" ? "all" : null;
    if (accessTier === null) return false;
    const query = TicketingConversation.query().where("id", Number(id));
    applyAgentScope(query, {
        agentId: agent ? Number(agent.id) : -1,
        userId: Number(user.id),
        accessTier: accessTier as "all" | "unassigned_and_own" | "participating",
    });
    const conversation = await query.first();
    return conversation !== null;
});

/**
 * Track active subscribers per channel root. We collapse `imports/123` and `imports/456` to the
 * `imports` channel root so the gauge stays bounded (one series per known root, not one per id).
 * Cardinality is the same handful of roots over the process's lifetime.
 */
const sseSubscriberCounts = new Map<string, number>();
const KNOWN_CHANNEL_ROOTS = ["imports", "exports", "ticketing"] as const;
for (const root of KNOWN_CHANNEL_ROOTS) {
    sseSubscriberCounts.set(root, 0);
    setSseClients(root, 0);
}

function channelRoot(channel: string): string {
    const slash = channel.indexOf("/");
    return slash === -1 ? channel : channel.slice(0, slash);
}

transmit.on("subscribe", ({ channel }) => {
    const root = channelRoot(channel);
    const next = (sseSubscriberCounts.get(root) ?? 0) + 1;
    sseSubscriberCounts.set(root, next);
    setSseClients(root, next);
});

transmit.on("unsubscribe", ({ channel }) => {
    const root = channelRoot(channel);
    const next = Math.max(0, (sseSubscriberCounts.get(root) ?? 0) - 1);
    sseSubscriberCounts.set(root, next);
    setSseClients(root, next);
});
