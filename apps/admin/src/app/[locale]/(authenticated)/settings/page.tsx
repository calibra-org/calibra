import { redirect } from "#/lib/i18n/navigation";

export default async function SettingsIndex({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: "/settings/general", locale });
}
