"use client";

import { Bold, Code, Italic, Link2, List, ListOrdered, Quote, Strikethrough } from "lucide-react";
import { useTranslations } from "next-intl";
import { type RefObject, useCallback } from "react";

import { cn } from "#/lib/utils";

interface MarkupToolbarProps {
    /** The textarea we're acting on — toolbar buttons read/write `.value` and `.selectionStart`. */
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    /** Notified after every mutation so the controlled-component parent stays in sync. */
    onChange: (next: string) => void;
    className?: string;
}

/**
 * WordPress-style markup toolbar over a plain `<textarea>`. Each button wraps the current
 * selection with a simple HTML tag (or inserts a placeholder block when nothing is selected),
 * then echoes the updated value through {@link onChange} so the controlled parent re-renders.
 *
 * The intent is not a full WYSIWYG — operators get the same six or seven shortcuts WP exposes
 * without pulling in a heavyweight editor. Output is HTML and is rendered verbatim downstream.
 */
export function MarkupToolbar({ textareaRef, onChange, className }: MarkupToolbarProps) {
    const t = useTranslations("Reviews.list.quickEdit.toolbar");

    const wrap = useCallback(
        (before: string, after: string = before, placeholder = "") => {
            const node = textareaRef.current;
            if (node === null) return;
            const start = node.selectionStart;
            const end = node.selectionEnd;
            const value = node.value;
            const selected = value.slice(start, end);
            const insert = selected.length > 0 ? selected : placeholder;
            const next = `${value.slice(0, start)}${before}${insert}${after}${value.slice(end)}`;
            onChange(next);
            /**
             * `requestAnimationFrame` lets React's controlled write settle before we move the caret —
             * setting `selectionStart` immediately fights the re-render and the caret jumps to 0.
             */
            requestAnimationFrame(() => {
                node.focus();
                const caretStart = start + before.length;
                const caretEnd = caretStart + insert.length;
                node.setSelectionRange(caretStart, caretEnd);
            });
        },
        [onChange, textareaRef],
    );

    const link = useCallback(() => {
        const url = window.prompt(t("linkPrompt"));
        if (url === null || url.trim().length === 0) return;
        wrap(`<a href="${url.trim()}">`, "</a>", t("linkPlaceholder"));
    }, [t, wrap]);

    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-1 rounded-t-md border border-border border-b-0 bg-muted/40 px-2 py-1.5",
                className,
            )}
        >
            <ToolbarButton onClick={() => wrap("<strong>", "</strong>", t("boldPlaceholder"))} title={t("bold")}>
                <Bold className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton onClick={() => wrap("<em>", "</em>", t("italicPlaceholder"))} title={t("italic")}>
                <Italic className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton onClick={() => wrap("<s>", "</s>", t("strikePlaceholder"))} title={t("strike")}>
                <Strikethrough className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarSep />
            <ToolbarButton onClick={link} title={t("link")}>
                <Link2 className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton onClick={() => wrap("<blockquote>", "</blockquote>", t("quotePlaceholder"))} title={t("quote")}>
                <Quote className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton onClick={() => wrap("<code>", "</code>", t("codePlaceholder"))} title={t("code")}>
                <Code className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarSep />
            <ToolbarButton onClick={() => wrap("<ul>\n  <li>", "</li>\n</ul>", t("listPlaceholder"))} title={t("list")}>
                <List className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton onClick={() => wrap("<ol>\n  <li>", "</li>\n</ol>", t("listPlaceholder"))} title={t("listOrdered")}>
                <ListOrdered className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
        </div>
    );
}

interface ToolbarButtonProps {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}

function ToolbarButton({ onClick, title, children }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {children}
        </button>
    );
}

function ToolbarSep() {
    return <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />;
}
