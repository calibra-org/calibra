import db from "@adonisjs/lucid/services/db";

/**
 * Truncate every phase-03 table between tests. RESTART IDENTITY keeps `bigserial` columns from
 * leaking row IDs across tests (so assertions on `id` stay stable when a test creates a single
 * row). CASCADE handles the FK from auth_access_tokens / customer_addresses / iran_profiles to the
 * parents in one call.
 */
export async function truncatePhase03Tables(): Promise<void> {
    const tables = [
        "customer_iran_profiles",
        "customer_downloads",
        "customer_addresses",
        "customers",
        "password_reset_tokens",
        "auth_access_tokens",
        "users",
    ];
    await db.rawQuery(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
