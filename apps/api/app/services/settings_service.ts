import Setting, { type SettingValueType } from "#models/setting";

const VALUE_MISSING = Symbol("settings.missing");

/**
 * Per-process cache around the `settings` table. Reads memoize; `set` invalidates the touched key
 * and its group so a subsequent read sees the new value. Designed to be installed as a container
 * singleton by later phases that need the same instance across requests (e.g. inventory hold time,
 * order number format).
 *
 * Not durable across processes. If two API instances both edit the same key, the second instance's
 * cache will lag until the entry is next read with a different value or the process restarts —
 * acceptable for the settings we ship (operator-edited, low write volume).
 */
export default class SettingsService {
    private readonly valueCache = new Map<string, unknown | typeof VALUE_MISSING>();
    private readonly groupCache = new Map<string, Record<string, unknown>>();

    async get<T>(group: string, key: string, fallback: T): Promise<T> {
        const cacheKey = `${group}.${key}`;

        if (this.valueCache.has(cacheKey)) {
            const cached = this.valueCache.get(cacheKey);
            return cached === VALUE_MISSING ? fallback : (cached as T);
        }

        const row = await Setting.query().where("group_key", group).where("key", key).first();

        if (!row) {
            this.valueCache.set(cacheKey, VALUE_MISSING);
            return fallback;
        }

        this.valueCache.set(cacheKey, row.value);
        return row.value as T;
    }

    async set(group: string, key: string, value: unknown, type: SettingValueType): Promise<void> {
        await Setting.updateOrCreate({ groupKey: group, key }, { value, type });
        this.invalidate(group, key);
    }

    async all(group: string): Promise<Record<string, unknown>> {
        const cached = this.groupCache.get(group);
        if (cached) return cached;

        const rows = await Setting.query().where("group_key", group);
        const map: Record<string, unknown> = {};
        for (const row of rows) {
            map[row.key] = row.value;
            this.valueCache.set(`${group}.${row.key}`, row.value);
        }

        this.groupCache.set(group, map);
        return map;
    }

    /** Drop any memoized state for the given group/key pair. Exposed for tests. */
    invalidate(group: string, key?: string): void {
        if (key) this.valueCache.delete(`${group}.${key}`);
        this.groupCache.delete(group);
    }

    /** Drop the entire memoized state. Exposed for tests that need a fully cold cache. */
    clearCache(): void {
        this.valueCache.clear();
        this.groupCache.clear();
    }
}
