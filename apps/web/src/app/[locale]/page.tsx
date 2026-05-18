import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { Link } from "#/lib/i18n/navigation";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    return <HomeContent />;
}

function HomeContent() {
    const t = useTranslations("Home");

    return (
        <section className="flex flex-col items-start gap-6 py-12">
            <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{t("heroTitle")}</h1>
            <p className="max-w-xl text-pretty text-lg text-muted-foreground">{t("heroBody")}</p>
            <Link
                href="/products"
                className="inline-flex items-center rounded-md bg-accent px-5 py-2.5 font-medium text-accent-foreground transition hover:opacity-90"
            >
                {t("browseProducts")}
            </Link>
        </section>
    );
}
