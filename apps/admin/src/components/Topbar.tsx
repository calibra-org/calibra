import { Bell, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

import { LocaleSwitch } from "./LocaleSwitch";

export function Topbar() {
    const t = useTranslations("Topbar");

    return (
        <header className="flex h-14 items-center justify-between gap-4 border-border border-b bg-card px-6">
            <div className="relative max-w-md flex-1">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input type="search" placeholder={t("search")} className="ps-9" />
            </div>

            <div className="flex items-center gap-2">
                <LocaleSwitch />
                <Button variant="outline" size="icon" aria-label={t("notifications")} className="relative">
                    <Bell className="size-4" aria-hidden="true" />
                    <span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />
                </Button>
                <div className="hidden items-center gap-2 ps-2 sm:flex">
                    <div className="grid size-8 place-items-center rounded-full bg-accent font-semibold text-accent-foreground text-xs">
                        A
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                        {t("signOut")}
                    </Button>
                </div>
            </div>
        </header>
    );
}
