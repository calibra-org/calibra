import { useTranslations } from "next-intl";

export function Footer() {
    const siteName = useTranslations("Site")("name");
    const rights = useTranslations("Common")("rights");
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 border-t border-border">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground">
                <span>
                    © {year} {siteName}
                </span>
                <span>{rights}</span>
            </div>
        </footer>
    );
}
