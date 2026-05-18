import { getTranslations, setRequestLocale } from "next-intl/server";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function CartPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Cart");

    return (
        <section className="flex flex-col gap-6 py-12">
            <h1 className="font-bold text-3xl tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("empty")}</p>
        </section>
    );
}
