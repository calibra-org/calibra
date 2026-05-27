import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listShippingClassOptions, listTaxClassOptions } from "#/lib/server-repos";
import { ProductDetail } from "#/views/products/detail/product-detail";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products.detail" });
    return { title: t("newProductTitle") };
}

/** Server-component shell for `New product`. Loads dropdown options + renders the empty form. */
export default async function NewProductPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const [taxClassOptions, shippingClassOptions] = await Promise.all([listTaxClassOptions(), listShippingClassOptions()]);
    return <ProductDetail isNew taxClassOptions={taxClassOptions} shippingClassOptions={shippingClassOptions} />;
}
