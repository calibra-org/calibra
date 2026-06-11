import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductDetailLoader } from "#/views/products/detail/product-detail-loader";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products.detail" });
    return { title: t("newProductTitle") };
}

/**
 * Thin server shell for `New product`: resolves the locale and renders the client loader in create
 * mode. The loader fetches the tax/shipping-class options via React Query and renders the empty
 * editor form once they resolve. No data is fetched here — by design.
 */
export default async function NewProductPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ProductDetailLoader isNew />;
}
