import { Bell, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitch } from "./LocaleSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface TopbarProps {
    user: { email: string; displayName: string };
}

export function Topbar({ user }: TopbarProps) {
    const t = useTranslations("Topbar");

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-border border-b bg-card/95 px-6 backdrop-blur">
            <div className="relative max-w-md flex-1">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input type="search" placeholder={t("search")} className="ps-9" aria-label={t("search")} />
            </div>

            <div className="flex items-center gap-2">
                <LocaleSwitch />
                <ThemeToggle />
                <Button variant="outline" size="icon" aria-label={t("notifications")} className="relative">
                    <Bell className="size-4" aria-hidden="true" />
                    <span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />
                </Button>
                <UserMenu displayName={user.displayName} email={user.email} />
            </div>
        </header>
    );
}
