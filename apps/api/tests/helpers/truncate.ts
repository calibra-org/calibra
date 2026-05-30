import testUtils from "@adonisjs/core/services/test_utils";

/**
 * Eager-cleaning wrapper around `testUtils.db().truncate()`. The bare Adonis helper only
 * schedules a truncate on teardown — for the FIRST test of a group, that means the test
 * inherits whatever the previous spec in this Japa process left behind. Pre-sharding the
 * alphabetical predecessor happened to leave a clean DB; under matrix sharding the
 * predecessor is arbitrary, so any group with a strict count assertion in its first test
 * needs to truncate at setup time too.
 *
 * Usage in a `group.each.setup`:
 *
 * ```ts
 * group.each.setup(async () => {
 *     const cleanup = await truncateAndCleanup();
 *     admin = await createAdmin();
 *     return cleanup;
 * });
 * ```
 *
 * The returned cleanup function is the same one Adonis returns from `truncate()` — Japa
 * still runs it as the test's teardown, so the database also leaves clean for the next
 * spec downstream.
 */
export async function truncateAndCleanup(): Promise<() => Promise<void>> {
    const cleanup = await testUtils.db().truncate();
    await cleanup();
    return cleanup;
}
