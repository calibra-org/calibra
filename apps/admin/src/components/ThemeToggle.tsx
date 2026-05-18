"use client";

import { Menu } from "@base-ui/react/menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "calibra-admin-theme";

function applyTheme(theme: Theme): void {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
}

export function ThemeToggle() {
    const t = useTranslations("Theme");
    const [theme, setTheme] = useState<Theme>("system");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
        const initial: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
        setTheme(initial);
        setMounted(true);
    }, []);

    function select(next: Theme): void {
        setTheme(next);
        window.localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
    }

    const ResolvedIcon = !mounted || theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;

    return (
        <Menu.Root>
            <Menu.Trigger
                render={(props) => (
                    <Button {...props} variant="outline" size="icon" aria-label={t("toggle")}>
                        <ResolvedIcon className="size-4" aria-hidden="true" />
                    </Button>
                )}
            />
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="end" className="z-50">
                    <Menu.Popup
                        className={cn(
                            "min-w-40 origin-[var(--transform-origin)] rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md outline-none",
                            "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                            "transition-[opacity,transform] duration-150",
                        )}
                    >
                        {(["light", "dark", "system"] as const).map((option) => {
                            const Icon = option === "light" ? Sun : option === "dark" ? Moon : Monitor;
                            const selected = theme === option;
                            return (
                                <Menu.Item
                                    key={option}
                                    onClick={() => select(option)}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none",
                                        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                                        selected && "font-medium",
                                    )}
                                >
                                    <Icon className="size-4" aria-hidden="true" />
                                    <span>{t(option)}</span>
                                </Menu.Item>
                            );
                        })}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
