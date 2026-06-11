import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductDetailLoader } from "#/views/products/detail/product-detail-loader";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("title") };
}

/**
 * Thin server shell for product detail: resolves the locale for next-intl's static optimization and
 * forwards only the route id into the client loader, which owns the React Query subscriptions
 * (`useProductDetail`, `useTaxClassOptions`, `useShippingClassOptions`) and renders a skeleton while
 * they resolve. No data is fetched here — by design.
 */
export default async function ProductDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <ProductDetailLoader productId={Number(id)} />;
}
