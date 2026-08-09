import { setRequestLocale } from "next-intl/server";

import { redirect } from "#/lib/i18n/navigation";

export default async function SeoIndex({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    redirect({ href: "/seo/overview", locale });
}
