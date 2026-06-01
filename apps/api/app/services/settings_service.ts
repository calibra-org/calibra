import cache from "@adonisjs/cache/services/main";
import { DateTime } from "luxon";

import Setting, { type SettingValueType } from "#models/setting";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { currentTenantId, maybeTenantContext, maybeTenantId } from "#services/tenant_context";

/**
 * Caching facade in front of the `settings` table. Reads memoize through the default cache store;
 * `set` invalidates the group's tag so a subsequent read from any process (api, queue worker,
 * future replica) sees the new value. Replaces the previous per-process `Map` caches — those left
 * a stale window the moment a sibling process edited the same key.
 *
 * Operator-edited values are low write volume; we cache groups forever (`null` TTL via
 * `setForever` is what we'd reach for if Bentocache exposed it directly, but a 24h TTL with an
 * explicit `deleteByTag` on every `set()` is functionally equivalent — the write IS the
 * invalidation signal).
 */
export default class SettingsService {
    async get<T>(group: string, key: string, fallback: T): Promise<T> {
        const groupMap = await this.all(group);
        if (Object.hasOwn(groupMap, key)) {
            return groupMap[key] as T;
        }
        return fallback;
    }

    /**
     * Upsert a single setting row. Uses a raw `INSERT … ON CONFLICT (group_key, key) DO UPDATE`
     * (same shape as the seeder) rather than `Setting.updateOrCreate` — the `settings` table has a
     * composite primary key `(group_key, key)`, and Lucid's model `.save()` keys its UPDATE off a
     * single primary column, which would clobber every row in the group. `value` is JSONB so it is
     * stringified to reach Postgres as a JSON literal.
     */
    async set(group: string, key: string, value: unknown, type: SettingValueType): Promise<void> {
        const now = DateTime.utc().toSQL();
        const tenantId = currentTenantId();
        const trx = maybeTenantContext()!.trx;
        await trx
            .table("settings")
            .insert({
                tenant_id: tenantId,
                group_key: group,
                key,
                value: JSON.stringify(value),
                type,
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "group_key", "key"])
            .merge(["value", "type", "updated_at"]);
        await this.invalidate(group);
    }

    async all(group: string): Promise<Record<string, unknown>> {
        const tenantId = maybeTenantId();
        const ctx = maybeTenantContext();
        return cache.getOrSet({
            key: CacheKeys.settings.group(group, tenantId),
            ttl: "24h",
            tags: [CacheTags.settingsGroup(group, tenantId)],
            factory: async () => {
                const rows = await Setting.query(ctx ? { client: ctx.trx } : {}).where("group_key", group);
                const map: Record<string, unknown> = {};
                for (const row of rows) {
                    map[row.key] = row.value;
                }
                return map;
            },
        });
    }

    /**
     * Drop any cached state for `group`. Exposed publicly so tests and admin-side bulk-edit flows
     * can force a refresh. The optional `key` argument is accepted for backwards-compat with
     * earlier per-key callers; since the cache is now keyed by group, both arguments evict the
     * same key.
     *
     * Deliberately uses `cache.delete` (single-key removal) instead of `cache.deleteByTag` —
     * Bentocache's tag invalidation compares millisecond-resolution timestamps, and a `set` →
     * `get` pair that happens inside the same millisecond can race where the freshly written
     * tag-invalidation timestamp is equal to the new cache entry's `createdAt`, which surfaces
     * as a flaky cache hit. A direct key removal is unambiguous and the 1:1 mapping between
     * settings group and cache key makes the tag layer unnecessary here.
     */
    async invalidate(group: string, _key?: string): Promise<void> {
        await cache.delete({ key: CacheKeys.settings.group(group, maybeTenantId()) });
    }

    /** Drop every settings cache entry. Used by tests that need a fully cold cache. */
    async clearCache(): Promise<void> {
        await cache.clear();
    }
}
