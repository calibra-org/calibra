import hash from "@adonisjs/core/services/hash";
import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

/**
 * Control-plane / global seed: subscription plans + a platform operator login. Runs before any
 * tenant is provisioned (tenants FK `plans`). Global tables (no RLS), so plain idempotent upserts.
 *
 * Known dev login for the control-plane: `platform@calibra.dev` / `Passw0rd1!`.
 */
export default class PlatformSeeder extends BaseSeeder {
    async run() {
        const now = DateTime.utc().toSQL()!;

        const plans = [
            {
                key: "starter",
                name: "Starter",
                db_tier: "shared",
                is_default: true,
                limits: JSON.stringify({
                    max_products: 500,
                    max_storage_bytes: 1_000_000_000,
                    max_orders_per_month: 1000,
                    max_staff: 2,
                }),
            },
            {
                key: "growth",
                name: "Growth",
                db_tier: "shared",
                is_default: false,
                limits: JSON.stringify({
                    max_products: 5000,
                    max_storage_bytes: 10_000_000_000,
                    max_orders_per_month: 20000,
                    max_staff: 10,
                }),
            },
            {
                key: "scale",
                name: "Scale",
                db_tier: "dedicated",
                is_default: false,
                limits: JSON.stringify({
                    max_products: 100000,
                    max_storage_bytes: 200_000_000_000,
                    max_orders_per_month: 1000000,
                    max_staff: 50,
                }),
            },
        ];

        for (const plan of plans) {
            await this.client
                .table("plans")
                .insert({ ...plan, created_at: now, updated_at: now })
                .onConflict("key")
                .merge(["name", "db_tier", "is_default", "limits", "updated_at"]);
        }

        const passwordHash = await hash.make("Passw0rd1!");
        await this.client
            .table("platform_users")
            .insert({
                email: "platform@calibra.dev",
                password_hash: passwordHash,
                name: "Platform Owner",
                role: "owner",
                created_at: now,
                updated_at: now,
            })
            .onConflict("email")
            .merge(["name", "role", "updated_at"]);
    }
}
