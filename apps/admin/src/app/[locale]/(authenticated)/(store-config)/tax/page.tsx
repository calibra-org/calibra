import { redirect } from "#/lib/i18n/navigation";

export default async function TaxIndex({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: "/tax/classes", locale });
}
