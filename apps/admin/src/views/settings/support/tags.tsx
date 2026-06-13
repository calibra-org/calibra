"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { type TicketTag, useCreateTicketTag, useDeleteTicketTag, useTicketTags } from "#/lib/queries/tickets";

const DEFAULT_COLOR = "#6366f1";

/** Ticket tag manager: a swatch + name create row above the current tag list. */
export function Tags() {
    const t = useTranslations("Settings");
    const { data: tags, isLoading } = useTicketTags();
    const create = useCreateTicketTag();
    const [name, setName] = useState("");
    const [color, setColor] = useState(DEFAULT_COLOR);

    const submit = async () => {
        if (name.trim().length === 0) return;
        await create.mutateAsync({ name: name.trim(), color });
        setName("");
        setColor(DEFAULT_COLOR);
    };

    if (isLoading) {
        return <Skeleton className="h-64 w-full rounded-xl" />;
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("support.tags.title")}</CardTitle>
                <CardDescription>{t("support.tags.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        aria-label={t("support.tags.color")}
                        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                    />
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("support.tags.namePlaceholder")}
                        className="max-w-xs flex-1"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") submit();
                        }}
                    />
                    <Button onClick={submit} disabled={create.isPending || name.trim().length === 0} className="gap-2">
                        {create.isPending ? <Spinner className="size-4" /> : null}
                        {t("support.tags.add")}
                    </Button>
                </div>
                <ul className="flex flex-wrap gap-2">
                    {(tags ?? []).length === 0 ? (
                        <li className="text-muted-foreground text-sm">{t("support.tags.empty")}</li>
                    ) : (
                        (tags ?? []).map((tag) => <TagChip key={tag.id} tag={tag} label={t("support.tags.delete")} />)
                    )}
                </ul>
            </CardContent>
        </Card>
    );
}

function TagChip({ tag, label }: { tag: TicketTag; label: string }) {
    const del = useDeleteTicketTag(tag.id);
    return (
        <li>
            <Badge
                variant="outline"
                className="gap-1.5 py-1 ps-2.5 pe-1"
                style={tag.color ? { borderColor: tag.color } : undefined}
            >
                {tag.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} /> : null}
                <span>{tag.name}</span>
                <button
                    type="button"
                    onClick={() => del.mutate(undefined)}
                    aria-label={label}
                    className="ms-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                    <Trash2 className="size-3" />
                </button>
            </Badge>
        </li>
    );
}
