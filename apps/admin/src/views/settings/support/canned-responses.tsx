"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { type TicketCannedResponse, useCannedResponses, useCreateCanned, useUpdateCanned } from "#/lib/queries/tickets";

/** Canned-response library: create / edit reusable reply templates keyed by a `/shortcut`. */
export function CannedResponses() {
    const t = useTranslations("Settings");
    const { data: responses, isLoading } = useCannedResponses();

    if (isLoading) {
        return <Skeleton className="h-64 w-full rounded-xl" />;
    }

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">{t("support.canned.title")}</CardTitle>
                    <CardDescription>{t("support.canned.subtitle")}</CardDescription>
                </div>
                <CannedDialog mode="create" trigger={<Button size="sm">{t("support.canned.add")}</Button>} />
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-4">
                {(responses ?? []).length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">{t("support.canned.empty")}</p>
                ) : (
                    (responses ?? []).map((response) => (
                        <div
                            key={response.id}
                            className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-3"
                        >
                            <div className="flex min-w-0 flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{response.title}</span>
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs" dir="ltr">
                                        /{response.shortcut}
                                    </code>
                                </div>
                                <p className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground text-sm">
                                    {response.body}
                                </p>
                            </div>
                            <CannedDialog
                                mode="edit"
                                response={response}
                                trigger={
                                    <Button variant="ghost" size="icon" aria-label={t("support.canned.edit")}>
                                        <Pencil className="size-4" />
                                    </Button>
                                }
                            />
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

interface CannedDialogProps {
    mode: "create" | "edit";
    response?: TicketCannedResponse;
    trigger: React.ReactNode;
}

function CannedDialog({ mode, response, trigger }: CannedDialogProps) {
    const t = useTranslations("Settings");
    const create = useCreateCanned();
    const update = useUpdateCanned(response?.id ?? "");
    const [open, setOpen] = useState(false);
    const [shortcut, setShortcut] = useState(response?.shortcut ?? "");
    const [title, setTitle] = useState(response?.title ?? "");
    const [body, setBody] = useState(response?.body ?? "");

    const pending = create.isPending || update.isPending;

    const submit = async () => {
        if (title.trim().length === 0 || body.trim().length === 0) return;
        const payload = { shortcut: shortcut.trim(), title: title.trim(), body: body.trim() };
        if (mode === "edit") {
            await update.mutateAsync(payload);
        } else {
            await create.mutateAsync(payload);
            setShortcut("");
            setTitle("");
            setBody("");
        }
        setOpen(false);
    };

    return (
        <DialogRoot open={open} onOpenChange={setOpen}>
            <DialogTrigger render={trigger as React.ReactElement} />
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{mode === "edit" ? t("support.canned.edit") : t("support.canned.add")}</DialogTitle>
                    <DialogDescription>{t("support.canned.dialogSubtitle")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.canned.shortcut")}</Label>
                        <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} dir="ltr" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.canned.titleField")}</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("support.canned.body")}</Label>
                        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        {t("support.cancel")}
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={pending || title.trim().length === 0 || body.trim().length === 0}
                        className="gap-2"
                    >
                        {pending ? <Spinner className="size-4" /> : null}
                        {t("support.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
