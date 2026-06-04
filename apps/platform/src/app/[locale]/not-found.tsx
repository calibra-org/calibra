import { getTranslations } from "next-intl/server";

import { Link } from "#/lib/i18n/navigation";

export default async function NotFound() {
    const t = await getTranslations("NotFound");
    return (
        <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 text-center">
            <div className="flex flex-col items-center gap-3">
                <span className="font-semibold text-4xl">404</span>
                <p className="text-muted-foreground text-sm">{t("message")}</p>
                <Link href="/" className="text-primary text-sm underline-offset-4 hover:underline">
                    {t("home")}
                </Link>
            </div>
        </main>
    );
}
