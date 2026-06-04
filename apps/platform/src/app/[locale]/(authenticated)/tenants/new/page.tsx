import { setRequestLocale } from "next-intl/server";

import { NewShopView } from "#/views/new-shop";

export default async function NewShopPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <NewShopView />;
}
