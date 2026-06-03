import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitch } from "#/components/LocaleSwitch";
import { ThemeToggle } from "#/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Store } from "#/icons";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "UnknownShop" });
    return { title: t("title") };
}

/**
 * Platform "unknown shop" state. The admin is per-tenant (RULE A): a `Host` that names no shop — the
 * apex, bare `localhost`, the per-spin Caddy host — lands here instead of any shop's login. Staff
 * reach their admin at their shop's address (`<slug>.admin.<root>` or `admin.<domain>`).
 */
export default async function UnknownShopPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("UnknownShop");

    return (
        <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-muted/40 px-4 py-12">
            <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
                <ThemeToggle />
                <LocaleSwitch />
            </div>

            <div className="relative z-10 flex w-full max-w-sm flex-col items-stretch gap-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="grid size-12 place-items-center rounded-xl border border-border/80 bg-card shadow-sm">
                        <Store className="size-5 text-foreground" aria-hidden="true" />
                    </div>
                </div>

                <Card className="border-border/70 shadow-md backdrop-blur-sm">
                    <CardHeader className="items-center text-center">
                        <CardTitle className="text-xl">{t("title")}</CardTitle>
                        <CardDescription>{t("subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-center text-muted-foreground text-sm leading-relaxed">{t("hint")}</p>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
