import { useTranslations } from "next-intl";

interface FooterProps {
    /** Brand display name from the tenant's branding. */
    brandName: string;
}

export function Footer({ brandName }: FooterProps) {
    const rights = useTranslations("Common")("rights");
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 border-border border-t">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 text-muted-foreground text-sm">
                <span>
                    © {year} {brandName}
                </span>
                <span>{rights}</span>
            </div>
        </footer>
    );
}
