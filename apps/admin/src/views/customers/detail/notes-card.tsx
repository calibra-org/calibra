"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { formatRelativeTime } from "#/lib/format";
import { useAddCustomerNote, useCustomerNotes, useDeleteCustomerNote } from "#/lib/queries/customers";

interface NotesCardProps {
    customerId: number;
    locale: Locale;
    t: (key: string) => string;
}

export function NotesCard({ customerId, locale, t }: NotesCardProps) {
    const { data: notes = [] } = useCustomerNotes(customerId);
    const add = useAddCustomerNote(customerId);
    const del = useDeleteCustomerNote(customerId);
    const [body, setBody] = useState("");

    const submit = async () => {
        if (body.trim().length === 0) return;
        await add.mutateAsync(body.trim());
        setBody("");
    };

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-2">
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t("notePlaceholder")}
                    rows={3}
                />
                <div className="flex justify-end">
                    <Button onClick={submit} disabled={add.isPending || body.trim().length === 0}>
                        {t("addNote")}
                    </Button>
                </div>
            </div>
            <ul className="flex flex-col gap-2">
                {notes.map((note) => (
                    <li
                        key={note.id}
                        className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-sm"
                    >
                        <div className="flex items-center justify-between text-muted-foreground text-xs">
                            <span>{note.authorEmail ?? "—"}</span>
                            <span>{formatRelativeTime(note.createdAt, locale)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-foreground">{note.body}</p>
                        <div className="flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => del.mutate(note.id)}>
                                {t("delete")}
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
