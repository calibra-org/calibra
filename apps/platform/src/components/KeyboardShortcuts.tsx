"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Dialog } from "#/components/ui/dialog";
import { useRouter } from "#/lib/i18n/navigation";
import { isEditableTarget } from "#/lib/keyboard";

interface KeyboardShortcutsProps {
    onOpenPalette: () => void;
    helpOpen: boolean;
    onHelpOpenChange: (open: boolean) => void;
}

/**
 * Global keyboard manager for the console:
 * - `⌘K` / `Ctrl-K` — open the command palette (works even while typing in a field).
 * - `/` — open the palette as a search (ignored inside inputs).
 * - `g o` / `g s` / `g p` — go to Overview / Shops / Plans (chord, ignored inside inputs).
 * - `?` — open this shortcuts cheatsheet.
 *
 * Renders the cheatsheet dialog. Mounted once by {@link CommandProvider}.
 */
export function KeyboardShortcuts({ onOpenPalette, helpOpen, onHelpOpenChange }: KeyboardShortcutsProps) {
    const t = useTranslations("Shortcuts");
    const router = useRouter();
    const pendingChord = useRef<{ key: string; at: number } | null>(null);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const editable = isEditableTarget(event.target);

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                onOpenPalette();
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (editable) return;

            if (event.key === "/") {
                event.preventDefault();
                onOpenPalette();
                return;
            }
            if (event.key === "?") {
                event.preventDefault();
                onHelpOpenChange(true);
                return;
            }

            const now = Date.now();
            const chord = pendingChord.current;
            if (chord !== null && chord.key === "g" && now - chord.at < 800) {
                const target = { o: "/", s: "/tenants", p: "/plans" }[event.key];
                if (target !== undefined) {
                    event.preventDefault();
                    router.push(target);
                }
                pendingChord.current = null;
                return;
            }
            pendingChord.current = event.key === "g" ? { key: "g", at: now } : null;
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onOpenPalette, onHelpOpenChange, router]);

    const rows: { keys: string[]; label: string }[] = [
        { keys: ["⌘", "K"], label: t("palette") },
        { keys: ["/"], label: t("search") },
        { keys: ["g", "o"], label: t("goOverview") },
        { keys: ["g", "s"], label: t("goShops") },
        { keys: ["g", "p"], label: t("goPlans") },
        { keys: ["j", "k"], label: t("rowNav") },
        { keys: ["↵"], label: t("rowOpen") },
        { keys: ["?"], label: t("help") },
    ];

    return (
        <Dialog open={helpOpen} onOpenChange={onHelpOpenChange} title={t("title")} size="sm">
            <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="flex items-center gap-1">
                            {row.keys.map((key) => (
                                <kbd
                                    key={key}
                                    className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                                >
                                    {key}
                                </kbd>
                            ))}
                        </span>
                    </li>
                ))}
            </ul>
        </Dialog>
    );
}
