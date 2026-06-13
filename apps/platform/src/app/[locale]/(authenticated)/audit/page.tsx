import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { AuditView } from "#/views/audit/audit-view";

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Audit");
    return (
        <div className="flex flex-col gap-5">
            <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
            <AuditView />
        </div>
    );
}
