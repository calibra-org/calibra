import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listBrands } from "#/lib/server-repos";
import { BrandsView } from "#/views/products/brands";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Brands" });
    return { title: t("title") };
}

/**
 * Server entry point. Fetches the flat brand list (with the per-row product-count fan-out
 * `listBrands` does) and hands it to the client workbench as the SSR seed. The view plants
 * the rows into the React Query cache on first mount so the list never flashes empty, and
 * every mutation afterwards rides through the same-origin admin proxy.
 */
export default async function BrandsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const { data } = await listBrands({ perPage: 200 });

    return <BrandsView initialRows={data} />;
}
