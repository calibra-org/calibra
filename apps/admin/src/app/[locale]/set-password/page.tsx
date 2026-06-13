import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PasswordSetForm } from "#/components/PasswordSetForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

interface PageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Password" });
    return { title: t("setTitle") };
}

/** Operator handoff-link landing — sets the operator's password via the single-use token. */
export default async function SetPasswordPage({ params, searchParams }: PageProps) {
    const { locale } = await params;
    const { token } = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations("Password");

    return (
        <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-12">
            <Card className="w-full max-w-sm border-border/70 shadow-md">
                <CardHeader className="items-center text-center">
                    <CardTitle className="text-xl">{t("setTitle")}</CardTitle>
                    <CardDescription>{t("setSubtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <PasswordSetForm mode="set" token={token} locale={locale} />
                </CardContent>
            </Card>
        </main>
    );
}
