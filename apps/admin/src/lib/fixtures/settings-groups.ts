import type { AdminSettingsGroup, SettingsGroupKey } from "#/lib/types";

/**
 * Settings-group fixtures. There is no first-party `/api/v1/admin/settings/{group}` operation yet for
 * the generic groups, so the screen renders static, instantly-available shapes — relocated verbatim
 * from the deleted `server-repos.ts` `SETTINGS_GROUPS`. The `general`/`datetime`/`media` groups have
 * bespoke client views and never read this fixture. Client-importable (no server imports).
 */
export const SETTINGS_GROUPS: AdminSettingsGroup[] = [
    {
        key: "general",
        title: { fa: "تنظیمات عمومی", en: "General" },
        subtitle: { fa: "نام فروشگاه، آدرس و واحد پول.", en: "Store name, address, and currency." },
        fields: [
            {
                key: "store_name",
                label: { fa: "نام فروشگاه", en: "Store name" },
                description: { fa: "", en: "" },
                type: "text",
                value: "Calibra",
            },
        ],
    },
];

/** Resolves a generic settings group from the fixture, or `null` when the key is unknown. */
export function getSettingsGroupFixture(key: SettingsGroupKey): AdminSettingsGroup | null {
    return SETTINGS_GROUPS.find((g) => g.key === key) ?? null;
}
