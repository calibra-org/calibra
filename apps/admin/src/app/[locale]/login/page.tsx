import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Login" });
    return { title: t("title") };
}

export default async function LoginPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Login");

    return (
        <main className="grid min-h-dvh place-items-center bg-muted/30 px-6">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>{t("title")}</CardTitle>
                    <CardDescription>{t("subtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5 text-sm">
                            <label htmlFor="login-email" className="font-medium">
                                {t("email")}
                            </label>
                            <Input id="login-email" type="email" name="email" autoComplete="email" required />
                        </div>

                        <div className="flex flex-col gap-1.5 text-sm">
                            <label htmlFor="login-password" className="font-medium">
                                {t("password")}
                            </label>
                            <Input id="login-password" type="password" name="password" autoComplete="current-password" required />
                        </div>

                        <Button type="submit" className="mt-1">
                            {t("submit")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
