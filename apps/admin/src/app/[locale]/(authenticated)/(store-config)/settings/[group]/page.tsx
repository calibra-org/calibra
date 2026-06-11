import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import type { SettingsGroupKey } from "#/lib/types";
import { DateTimeSettings } from "#/views/settings/datetime/datetime-settings";
import { GeneralSettings } from "#/views/settings/general/general-settings";
import { MediaSettings } from "#/views/settings/media/media-settings";
import { GenericSettingsView } from "#/views/store-config/settings/generic-settings-view";

interface PageProps {
    params: Promise<{ locale: string; group: string }>;
}

function isSettingsGroupKey(value: string): value is SettingsGroupKey {
    return ["general", "datetime", "media", "products", "tax", "shipping", "account", "email", "advanced"].includes(value);
}

/** Groups with a bespoke client view that fetches its own data + owns its save bar. */
function isDedicatedView(group: SettingsGroupKey): group is "general" | "datetime" | "media" {
    return group === "general" || group === "datetime" || group === "media";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, group } = await params;
    if (!isSettingsGroupKey(group)) return { title: "—" };
    const t = await getTranslations({ locale: locale as Locale, namespace: "Settings.groups" });
    return { title: t(group) };
}

/**
 * Settings group screen — thin server shell. Keeps the server-side `notFound()` gate for unknown
 * group keys, then delegates rendering: `general`/`datetime`/`media` to their bespoke client views,
 * every other (generic) group to {@link GenericSettingsView} over the static fixture.
 */
export default async function SettingsGroupPage({ params }: PageProps) {
    const { locale, group } = await params;
    setRequestLocale(locale);
    if (!isSettingsGroupKey(group)) notFound();
    const t = await getTranslations("Settings");

    if (isDedicatedView(group)) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title={t("title")} subtitle={t("subtitle")} />
                {group === "general" ? <GeneralSettings /> : group === "datetime" ? <DateTimeSettings /> : <MediaSettings />}
            </div>
        );
    }

    return <GenericSettingsView group={group} />;
}
