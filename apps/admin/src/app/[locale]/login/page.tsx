import { Box, Shield, Sparkles, Zap } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitch } from "#/components/LocaleSwitch";
import { LoginForm } from "#/components/LoginForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";

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
    const site = await getTranslations("Site");

    return (
        <main className="grid min-h-dvh grid-cols-1 bg-background lg:grid-cols-2">
            <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-12 text-white lg:flex">
                <div className="absolute inset-0 opacity-20" aria-hidden="true">
                    <div className="absolute -end-32 -top-32 size-96 rounded-full bg-white blur-3xl" />
                    <div className="absolute -start-32 -bottom-32 size-96 rounded-full bg-fuchsia-300 blur-3xl" />
                </div>
                <div className="relative flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
                        <Box className="size-5" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-lg leading-tight">{site("name")}</span>
                        <span className="text-white/70 text-xs">{site("tagline")}</span>
                    </div>
                </div>

                <div className="relative flex flex-col gap-8">
                    <h2 className="max-w-md font-semibold text-4xl leading-tight">
                        {locale === "fa"
                            ? "تجربه‌ای مدرن برای مدیریت فروشگاه ایرانی."
                            : "A modern admin built for Iranian commerce."}
                    </h2>
                    <ul className="flex flex-col gap-3 text-sm">
                        <li className="flex items-center gap-2 text-white/85">
                            <Zap className="size-4" aria-hidden="true" />
                            {locale === "fa"
                                ? "پشتیبانی کامل از تومان، ریال و مالیات بر ارزش افزوده"
                                : "Full Toman, Rial and VAT support"}
                        </li>
                        <li className="flex items-center gap-2 text-white/85">
                            <Shield className="size-4" aria-hidden="true" />
                            {locale === "fa" ? "احراز هویت امن با access token" : "Secure access-token authentication"}
                        </li>
                        <li className="flex items-center gap-2 text-white/85">
                            <Sparkles className="size-4" aria-hidden="true" />
                            {locale === "fa"
                                ? "حالت روشن، تاریک و دو زبان فارسی + انگلیسی"
                                : "Light, dark and bilingual fa + en out of the box"}
                        </li>
                    </ul>
                </div>

                <div className="relative text-white/65 text-xs">{t("footerCopyright")}</div>
            </section>

            <section className="flex flex-col">
                <div className="flex h-14 items-center justify-end border-border border-b px-6 lg:border-b-0">
                    <LocaleSwitch />
                </div>
                <div className="grid flex-1 place-items-center px-6 pb-12">
                    <Card className="w-full max-w-sm border-border/70">
                        <CardHeader>
                            <CardTitle className="text-xl">{t("title")}</CardTitle>
                            <CardDescription>{t("subtitle")}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            <LoginForm locale={locale} />
                            <Separator />
                            <p className="text-center text-muted-foreground text-xs">{t("footerCopyright")}</p>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </main>
    );
}
