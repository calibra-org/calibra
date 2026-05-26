import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getProduct, getProductDetail, listShippingClassOptions, listTaxClassOptions } from "#/lib/server-repos";
import { ProductDetail } from "#/views/products/detail/product-detail";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    const product = await getProduct(Number(id));
    return { title: product === null ? t("title") : product.name[locale as Locale] };
}

/**
 * Server component shell for the product detail page. Fetches the full SDK detail payload + the
 * tax-class / shipping-class option lists in parallel, then hands off to the client wrapper.
 * 404 redirects when the id doesn't resolve.
 */
export default async function ProductDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);

    const [initialSdkPayload, taxClassOptions, shippingClassOptions] = await Promise.all([
        getProductDetail(Number(id)),
        listTaxClassOptions(),
        listShippingClassOptions(),
    ]);
    if (initialSdkPayload === null) notFound();

    return (
        <ProductDetail
            initialSdkPayload={initialSdkPayload}
            taxClassOptions={taxClassOptions}
            shippingClassOptions={shippingClassOptions}
        />
    );
}
