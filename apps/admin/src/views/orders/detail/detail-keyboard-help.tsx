"use client";

import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";

interface DetailKeyboardHelpProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
}

/**
 * Shortcut cheat-sheet for the order detail page. Bindings live in {@link OrdersDetail}'s
 * `useEffect` handler; this dialog is the on-screen documentation. Keep the two in sync — if a
 * binding moves, the row label here moves too.
 */
export function DetailKeyboardHelp({ open, onOpenChange }: DetailKeyboardHelpProps) {
    const t = useTranslations("Orders.detail.keyboard");

    const sections: { title: string; rows: { keys: string[]; label: string }[] }[] = [
        {
            title: t("section.page"),
            rows: [
                { keys: ["a"], label: t("focusAddItem") },
                { keys: ["r"], label: t("openRefund") },
                { keys: ["n"], label: t("focusNote") },
                { keys: ["s"], label: t("saveAll") },
                { keys: ["?"], label: t("openHelp") },
            ],
        },
        {
            title: t("section.print"),
            rows: [
                { keys: ["⌘P", "Ctrl+P"], label: t("printInvoice") },
                { keys: ["⌘⇧P", "Ctrl+Shift+P"], label: t("printPacking") },
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
