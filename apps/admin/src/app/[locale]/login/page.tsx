import { Box, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitch } from "#/components/LocaleSwitch";
import { LoginForm } from "#/components/LoginForm";
import { ThemeToggle } from "#/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

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

    const highlights = [
        { icon: ShieldCheck, label: t("highlightSecure") },
        { icon: Globe2, label: t("highlightBilingual") },
        { icon: Sparkles, label: t("highlightTheme") },
    ];

    return (
        <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-muted/40 px-4 py-12">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
                <div className="absolute start-1/2 top-[-12rem] size-[36rem] -translate-x-1/2 rounded-full bg-foreground/[0.04] blur-3xl" />
                <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--foreground)/0.06)_1px,transparent_0)] [background-size:24px_24px]" />
            </div>

            <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
                <ThemeToggle />
                <LocaleSwitch />
            </div>

            <div className="relative z-10 flex w-full max-w-sm flex-col items-stretch gap-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="grid size-12 place-items-center rounded-xl border border-border/80 bg-card shadow-sm">
                        <Box className="size-5 text-foreground" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                        <span className="font-semibold text-base leading-tight">{site("name")}</span>
                        <span className="text-muted-foreground text-xs">{site("tagline")}</span>
                    </div>
                </div>

                <Card className="border-border/70 shadow-md backdrop-blur-sm">
                    <CardHeader className="items-center text-center">
                        <CardTitle className="text-xl">{t("title")}</CardTitle>
                        <CardDescription>{t("subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LoginForm locale={locale} />
                    </CardContent>
                </Card>

                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
                    {highlights.map(({ icon: Icon, label }) => (
                        <li key={label} className="inline-flex items-center gap-1.5">
                            <Icon className="size-3.5" aria-hidden="true" />
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>

                <p className="text-center text-muted-foreground text-xs">{t("footerCopyright")}</p>
            </div>
        </main>
    );
}
