import { redirect } from "#/lib/i18n/navigation";

export default async function ShippingIndex({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: "/shipping/zones", locale });
}
