"use client";

import { Paperclip, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { useCannedResponses, usePostTicketMessage } from "#/lib/queries/tickets";
import { cn } from "#/lib/utils";

interface ComposerProps {
    ticketId: string | number;
}

type ComposerMode = "reply" | "note";

/**
 * Reply / internal-note composer for the conversation thread.
 *
 *  - A Reply ↔ Internal note tab toggle decides whether the posted message is an outbound reply or
 *    a `is_note` private note.
 *  - Typing `/shortcut` surfaces a canned-response picker fed by {@link useCannedResponses}; picking
 *    one drops its body into the textarea.
 *  - The attach affordance is stubbed — the real media picker (upload → `attachment_media_ids`) is a
 *    follow-up; the button is wired but only collects ids it is given.
 */
export function Composer({ ticketId }: ComposerProps) {
    const t = useTranslations("Tickets");
    const post = usePostTicketMessage(ticketId);
    const { data: canned = [] } = useCannedResponses();

    const [mode, setMode] = useState<ComposerMode>("reply");
    const [body, setBody] = useState("");
    const [attachmentIds, setAttachmentIds] = useState<number[]>([]);

    /**
     * When the textarea content is exactly a `/token` (no trailing space yet), filter the canned
     * responses by shortcut prefix and show the picker. Selecting one replaces the whole body.
     */
    const shortcutQuery = useMemo(() => {
        const match = body.match(/^\/(\S*)$/);
        return match ? match[1] : null;
    }, [body]);

    const suggestions = useMemo(() => {
        if (shortcutQuery === null) return [];
        const needle = shortcutQuery.toLowerCase();
        return canned.filter((entry) => entry.shortcut.toLowerCase().includes(needle)).slice(0, 6);
    }, [canned, shortcutQuery]);

    const submit = async () => {
        const trimmed = body.trim();
        if (trimmed.length === 0) return;
        try {
            await post.mutateAsync({
                body: trimmed,
                is_note: mode === "note",
                content_type: "text",
                attachment_media_ids: attachmentIds.length > 0 ? attachmentIds : undefined,
            });
            setBody("");
            setAttachmentIds([]);
        } catch {
            toast.add({ title: t("composer.sendError"), timeout: 3500, data: { tone: "error" } });
        }
    };

    /**
     * TODO: wire the real media picker. It should open the media upload flow, push each uploaded
     * media id into `attachmentIds`, and render thumbnails. For now it is a no-op affordance so the
     * composer compiles and the attachment plumbing is in place end-to-end.
     */
    const onAttach = () => {
        toast.add({ title: t("composer.attachSoon"), timeout: 2500 });
    };

    return (
        <div className="flex flex-col gap-2">
            <Tabs value={mode} onValueChange={(value) => setMode(value as ComposerMode)} variant="line">
                <TabsList>
                    <TabsTrigger value="reply">{t("composer.reply")}</TabsTrigger>
                    <TabsTrigger value="note">{t("composer.note")}</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="relative">
                <Textarea
                    rows={4}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={mode === "note" ? t("composer.notePlaceholder") : t("composer.replyPlaceholder")}
                    className={cn(mode === "note" && "border-warning/40 bg-warning/5")}
                />
                {suggestions.length > 0 && (
                    <ul className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                        {suggestions.map((entry) => (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-start hover:bg-accent hover:text-accent-foreground"
                                    onClick={() => setBody(entry.body)}
                                >
                                    <span className="flex items-center gap-2 text-sm">
                                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                                            /{entry.shortcut}
                                        </span>
                                        <span className="font-medium">{entry.title}</span>
                                    </span>
                                    <span className="line-clamp-1 text-muted-foreground text-xs">{entry.body}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onAttach} type="button">
                    <Paperclip className="size-4" aria-hidden="true" />
                    {t("composer.attach")}
                </Button>
                <Button size="sm" onClick={submit} disabled={post.isPending || body.trim().length === 0}>
                    <Send className="size-4" aria-hidden="true" />
                    {mode === "note" ? t("composer.addNote") : t("composer.send")}
                </Button>
            </div>
        </div>
    );
}
