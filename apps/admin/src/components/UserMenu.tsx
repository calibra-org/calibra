"use client";

import { LogOut, User } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { logoutAction } from "#/lib/auth-actions";

interface UserMenuProps {
    displayName: string;
    email: string;
}

export function UserMenu({ displayName, email }: UserMenuProps) {
    const topbar = useTranslations("Topbar");
    const initials = displayName
        .split(/\s+/)
        .map((word) => word[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={(props) => (
                    <button
                        {...props}
                        type="button"
                        className="flex items-center gap-2 rounded-full bg-accent/60 py-1 ps-1 pe-3 outline-none transition hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                        <span className="grid size-7 place-items-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
                            {initials || "A"}
                        </span>
                        <span className="hidden text-sm sm:inline">{displayName}</span>
                    </button>
                )}
            />
            <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
                <DropdownMenuLabel>{topbar("account")}</DropdownMenuLabel>
                <div className="px-2.5 pb-1.5">
                    <div className="font-medium text-sm">{displayName}</div>
                    <div className="truncate text-muted-foreground text-xs">{email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                    <User className="size-4" aria-hidden="true" />
                    <span>{topbar("profile")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logoutAction}>
                    <button
                        type="submit"
                        className="flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-rose-600 outline-none hover:bg-accent hover:text-rose-600 focus-visible:bg-accent"
                    >
                        <LogOut className="size-4" aria-hidden="true" />
                        <span>{topbar("signOut")}</span>
                    </button>
                </form>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
