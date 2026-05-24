"use client";

import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";

interface KeyboardHelpDialogProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
}

/**
 * Cheat-sheet of the keyboard shortcuts the orders workbench surfaces. Opened via the `?` shortcut
 * or the header button. Intentionally a static table — the bindings are baked into DataTable +
 * orders-list.tsx, so this is documentation, not configuration.
 */
export function KeyboardHelpDialog({ open, onOpenChange }: KeyboardHelpDialogProps) {
    const t = useTranslations("Orders.list.keyboard");

    const sections: { title: string; rows: { keys: string[]; label: string }[] }[] = [
        {
            title: t("section.rows"),
            rows: [
                { keys: ["j", "↓"], label: t("nextRow") },
                { keys: ["k", "↑"], label: t("prevRow") },
                { keys: ["x"], label: t("toggleSelect") },
                { keys: ["e"], label: t("openPreview") },
                { keys: ["Enter"], label: t("openDetail") },
            ],
        },
        {
            title: t("section.page"),
            rows: [
                { keys: ["/"], label: t("focusSearch") },
                { keys: ["n"], label: t("newOrder") },
                { keys: ["?"], label: t("openHelp") },
            ],
        },
        {
            title: t("section.preview"),
            rows: [
                { keys: ["←", "→"], label: t("navigatePreview") },
                { keys: ["Esc"], label: t("closePreview") },
            ],
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("subtitle")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    {sections.map((section) => (
                        <section key={section.title} className="flex flex-col gap-2">
                            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">{section.title}</h3>
                            <dl className="flex flex-col gap-1.5">
                                {section.rows.map((row) => (
                                    <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                                        <dt>{row.label}</dt>
                                        <dd className="flex items-center gap-1">
                                            {row.keys.map((key) => (
                                                <kbd
                                                    key={key}
                                                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
