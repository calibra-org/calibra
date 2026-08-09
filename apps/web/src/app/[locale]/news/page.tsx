import { redirect } from "#/lib/i18n/navigation";
export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: "/mag", locale });
}
