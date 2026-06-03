import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Anonymous-cart cleanup. Deletes every cart with `customer_id IS NULL` whose `last_activity_at`
 * is older than `settings.inventory.cart_abandonment_days` (default 30). Logged-in carts are left
 * alone — the customer may return weeks later and still expect their cart waiting.
 *
 * **Runs per-tenant.** `carts` is tenant-scoped (RLS) and the abandonment window is a per-tenant
 * setting, so the purge loops every tenant via {@link forEachTenant} (fail-closed runtime role +
 * `app.current_tenant` GUC), resolving each shop's own window and deleting only its carts. A purge
 * on a context-less connection would delete zero rows (fail-closed) under `calibra_app`.
 *
 * Designed to run nightly via the host cron (suggested line:
 * `0 3 * * * cd /srv/calibra/apps/api && node build/ace.js cart:purge`). The application is
 * booted (`startApp: true`) so models, settings cache, and DB pool are all available.
 */
export default class CartPurge extends BaseCommand {
    static commandName = "cart:purge";
    static description = "Delete anonymous carts older than settings.inventory.cart_abandonment_days (per-tenant)";

    static options: CommandOptions = {
        startApp: true,
    };

    async run() {
        const { default: SettingsService } = await import("#services/settings_service");
        const Cart = (await import("#models/cart")).default;
        const { forEachTenant } = await import("#services/tenant_runner");

        let totalPurged = 0;
        const ids = await forEachTenant(async (tenantId) => {
            const days = await new SettingsService().get<number>("inventory", "cart_abandonment_days", 30);
            if (!Number.isFinite(days) || days <= 0) {
                this.logger.warning(`tenant ${tenantId}: cart_abandonment_days is ${days}; skipping (set a positive value).`);
                return;
            }
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            const affected = Number(await Cart.query().whereNull("customer_id").where("last_activity_at", "<", cutoff).delete());
            totalPurged += affected;
            this.logger.info(`tenant ${tenantId}: purged ${affected} anonymous cart(s) older than ${days} day(s).`);
        });

        this.logger.info(`Purged ${totalPurged} anonymous cart(s) across ${ids.length} tenant(s).`);
    }
}
