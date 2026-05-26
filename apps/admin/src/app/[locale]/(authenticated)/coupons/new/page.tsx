import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CouponEditor } from "#/views/coupons/detail/coupon-editor";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Coupons.editor" });
    return { title: t("titleNew") };
}

/**
 * Create-mode editor — same client component as the edit page, with `id={null}` flipping the
 * form into create mode (no preload, on-save redirects to `/coupons/{newId}`).
 */
export default async function NewCouponPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CouponEditor id={null} />;
}
