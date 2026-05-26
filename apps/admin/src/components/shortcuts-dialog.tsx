"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export interface Shortcut {
    /** Display label e.g. "Move to trash". */
    label: string;
    /** Key combos for this shortcut (rendered as styled `<kbd>` chips, separated by `+`). */
    keys: string[];
}

export interface ShortcutsGroup {
    title: string;
    items: Shortcut[];
}

export interface ShortcutsDialogProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    title: string;
    groups: ShortcutsGroup[];
    /** Optional footer slot (e.g. a "view all docs →" link). */
    footer?: ReactNode;
}

/**
 * App-wide keyboard shortcut cheatsheet — invoked from any page via `?`. Renders groups of
 * shortcut rows with styled `<kbd>` chips. Keep the cheatsheet self-documenting: every shortcut
 * the page wires in the keydown handler should appear here.
 */
export function ShortcutsDialog({ open, onOpenChange, title, groups, footer }: ShortcutsDialogProps) {
    return (
        <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
            <BaseDialog.Portal>
                <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <BaseDialog.Popup
                    className={cn(
                        "fixed start-1/2 top-1/2 z-50 flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,scale] duration-150",
                    )}
                >
                    <BaseDialog.Title className="font-semibold text-base">{title}</BaseDialog.Title>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                        {groups.map((group) => (
                            <div key={group.title} className="flex flex-col gap-2">
                                <h3 className="text-muted-foreground text-xs uppercase tracking-wide">{group.title}</h3>
                                <ul className="flex flex-col">
                                    {group.items.map((shortcut) => (
                                        <li
                                            key={shortcut.label}
                                            className="flex items-center justify-between gap-3 border-border/40 border-b py-1.5 last:border-b-0"
                                        >
                                            <span className="text-sm">{shortcut.label}</span>
                                            <span className="flex items-center gap-1">
                                                {shortcut.keys.map((key) => (
                                                    <kbd
                                                        key={key}
                                                        className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                                    >
                                                        {key}
                                                    </kbd>
                                                ))}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    {footer !== undefined && <div className="border-border/60 border-t pt-3 text-xs">{footer}</div>}
                </BaseDialog.Popup>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}
