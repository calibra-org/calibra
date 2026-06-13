import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PasswordSetForm } from "#/components/PasswordSetForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Password" });
    return { title: t("changeTitle") };
}

/** Forced password-change screen — where the 423 `E_PASSWORD_CHANGE_REQUIRED` gate sends operators. */
export default async function ChangePasswordPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Password");

    return (
        <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-12">
            <Card className="w-full max-w-sm border-border/70 shadow-md">
                <CardHeader className="items-center text-center">
                    <CardTitle className="text-xl">{t("changeTitle")}</CardTitle>
                    <CardDescription>{t("changeSubtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <PasswordSetForm mode="change" locale={locale} />
                </CardContent>
            </Card>
        </main>
    );
}
