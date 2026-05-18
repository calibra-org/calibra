/**
 * Pick the translation row matching `locale`, falling back in order: requested locale → `fa`
 * (project default) → `en` → first available. Returns `null` when the array is empty so callers
 * can default to surface-defined placeholders.
 */
export function pickTranslation<T extends { locale: string }>(rows: T[] | undefined | null, locale: string): T | null {
    if (!rows || rows.length === 0) return null;
    const direct = rows.find((r) => r.locale === locale);
    if (direct) return direct;
    const fa = rows.find((r) => r.locale === "fa");
    if (fa) return fa;
    const en = rows.find((r) => r.locale === "en");
    if (en) return en;
    return rows[0] ?? null;
}
