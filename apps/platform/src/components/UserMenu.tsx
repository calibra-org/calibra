"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "#/components/ui/button";
import { logoutAction } from "#/lib/auth-actions";
import { cn } from "#/lib/utils";

/** Topbar account menu. Sign-out clears the session server-side then navigates client-side. */
export function UserMenu({ name, email }: { name: string; email: string }) {
    const t = useTranslations("Nav");
    const [signingOut, startSignOut] = useTransition();
    const initials = name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();

    function signOut() {
        startSignOut(async () => {
            const { redirectTo } = await logoutAction();
            window.location.assign(redirectTo);
        });
    }

    return (
        <Menu.Root>
            <Menu.Trigger
                render={(props) => (
                    <button
                        {...props}
                        type="button"
                        className="flex items-center gap-2 rounded-full bg-accent/60 py-1 ps-1 pe-3 outline-none transition hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                        <span className="grid size-7 place-items-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
                            {initials || "O"}
                        </span>
                        <span className="hidden text-sm sm:inline">{name}</span>
                    </button>
                )}
            />
            <Menu.Portal>
                <Menu.Positioner sideOffset={8} align="end" className="z-50">
                    <Menu.Popup className="min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md outline-none">
                        <div className="px-2.5 py-1.5">
                            <div className="font-medium">{name}</div>
                            <div className="truncate text-muted-foreground text-xs">{email}</div>
                        </div>
                        <div className="my-1 h-px bg-border" />
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={signOut}
                            disabled={signingOut}
                            className={cn("w-full justify-start gap-2 text-danger hover:text-danger")}
                        >
                            <LogOut className="size-4" aria-hidden="true" />
                            <span>{t("signOut")}</span>
                        </Button>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
