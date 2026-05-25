import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CouponEditor } from "#/views/coupons/detail/coupon-editor";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const t = await getTranslations({ locale, namespace: "Coupons.editor" });
    return { title: t("titleEdit", { code: id }) };
}

/**
 * Server shell for the editable coupon detail page. The full form (with code uniqueness probe,
 * dirty-state bar, and live redemption stats) lives inside the client `CouponEditor` so it can
 * own the form state and the per-section optimistic mutations.
 */
export default async function CouponDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <CouponEditor id={Number(id)} />;
}
