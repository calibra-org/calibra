import { setRequestLocale } from "next-intl/server";

import { ShopDetailView } from "#/views/shop-detail";

export default async function ShopDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <ShopDetailView id={id} />;
}
