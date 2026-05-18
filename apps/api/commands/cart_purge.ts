import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Anonymous-cart cleanup. Deletes every cart with `customer_id IS NULL` whose `last_activity_at`
 * is older than `settings.inventory.cart_abandonment_days` (default 30). Logged-in carts are left
 * alone — the customer may return weeks later and still expect their cart waiting.
 *
 * Designed to run nightly via the host cron (suggested line:
 * `0 3 * * * cd /srv/calibra/apps/api && node build/ace.js cart:purge`). The application is
 * booted (`startApp: true`) so models, settings cache, and DB pool are all available.
 */
export default class CartPurge extends BaseCommand {
    static commandName = "cart:purge";
    static description = "Delete anonymous carts older than settings.inventory.cart_abandonment_days";

    static options: CommandOptions = {
        startApp: true,
    };

    async run() {
        const { default: SettingsService } = await import("#services/settings_service");
        const Cart = (await import("#models/cart")).default;

        const settings = new SettingsService();
        const days = await settings.get<number>("inventory", "cart_abandonment_days", 30);
        if (!Number.isFinite(days) || days <= 0) {
            this.logger.warning(`cart_abandonment_days is ${days}; refusing to purge — set a positive value in settings.`);
            return;
        }

        const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
        const cutoff = new Date(cutoffMs).toISOString();

        const affected = await Cart.query().whereNull("customer_id").where("last_activity_at", "<", cutoff).delete();

        this.logger.info(`Purged ${affected} anonymous carts older than ${days} day(s) (cutoff ${cutoff}).`);
    }
}
