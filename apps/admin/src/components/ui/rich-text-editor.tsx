"use client";

import { cn } from "@calibra/shared";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "isomorphic-dompurify";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { useCallback, useEffect } from "react";

import { Button } from "#/components/ui/button";

const SANITIZER_OPTIONS = {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3", "blockquote", "a", "code", "pre"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|tel:|\/)/i,
};

/**
 * Sanitizes editor-produced HTML before it leaves the form. The same allowlist is applied on the
 * API side via `sanitize-html` — both layers exist because admin operators are trusted but not
 * infallible, and a compromised admin session shouldn't be able to plant `<script>` on the
 * storefront.
 */
export function sanitizeProductHtml(html: string): string {
    return DOMPurify.sanitize(html, SANITIZER_OPTIONS);
}

export interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    dir?: "ltr" | "rtl";
    minHeightClass?: string;
}

/**
 * Tiptap-based rich-text editor for the product description. Stores sanitized HTML. The toolbar
 * covers the parity surface (bold, italic, link, headings, lists, quote); the storefront renders
 * the stored HTML verbatim through its existing renderer.
 *
 * The Persian default direction means the editor mounts with `dir="rtl"`; pass `dir="ltr"` from
 * the English tab. We re-mount on direction change (key={dir}) so Tiptap's content layout flips
 * cleanly instead of fighting the cursor.
 */
export function RichTextEditor({ value, onChange, placeholder, dir = "rtl", minHeightClass = "min-h-44" }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                codeBlock: false,
            }),
            Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener nofollow", target: "_blank" } }),
            Placeholder.configure({ placeholder: placeholder ?? "" }),
        ],
        content: value,
        editorProps: {
            attributes: {
                class: cn(
                    "prose prose-sm dark:prose-invert max-w-none px-3 py-2 focus:outline-none",
                    minHeightClass,
                    "[&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:mt-3 [&_h3]:mb-2 [&_p]:my-2",
                ),
                dir,
            },
        },
        onUpdate: ({ editor: instance }) => {
            const html = instance.getHTML();
            onChange(sanitizeProductHtml(html));
        },
        immediatelyRender: false,
    });

    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if (current !== value) {
            editor.commands.setContent(value, false);
        }
    }, [value, editor]);

    const addLink = useCallback(() => {
        if (!editor) return;
        const previous = editor.getAttributes("link").href ?? "";
        const url = window.prompt("URL", previous);
        if (url === null) return;
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }, [editor]);

    if (!editor) {
        return <div className={cn("rounded-md border border-border bg-card", minHeightClass)} />;
    }

    return (
        <div className="rounded-md border border-border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <div className="flex flex-wrap items-center gap-0.5 border-border border-b px-1 py-1">
                <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
                    <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
                    <Italic className="size-3.5" />
                </ToolbarButton>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    active={editor.isActive("heading", { level: 2 })}
                >
                    <Heading2 className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    active={editor.isActive("heading", { level: 3 })}
                >
                    <Heading3 className="size-3.5" />
                </ToolbarButton>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive("bulletList")}
                >
                    <List className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive("orderedList")}
                >
                    <ListOrdered className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    active={editor.isActive("blockquote")}
                >
                    <Quote className="size-3.5" />
                </ToolbarButton>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <ToolbarButton onClick={addLink} active={editor.isActive("link")}>
                    <Link2 className="size-3.5" />
                </ToolbarButton>
            </div>
            <EditorContent editor={editor} />
        </div>
    );
}

function ToolbarButton({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-7", active && "bg-accent text-accent-foreground")}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}
