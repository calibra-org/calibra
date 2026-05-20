import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Link } from "#/lib/i18n/navigation";

import { ProductsListClient } from "./ProductsListClient";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("title") };
}

export default async function ProductsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Products");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button asChild>
                        <Link href="/products/new">
                            <Plus className="size-4" aria-hidden="true" />
                            {t("addProduct")}
                        </Link>
                    </Button>
                }
            />

            <ProductsListClient />
        </section>
    );
}
