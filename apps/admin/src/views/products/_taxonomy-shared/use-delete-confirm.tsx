"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useState } from "react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";

interface UseDeleteConfirmOptions {
    /** Runs once the operator confirms. The dialog closes immediately after. */
    onConfirm: () => void;
    /** Disables both buttons while the delete is in flight. */
    pending: boolean;
}

interface UseDeleteConfirm {
    /** Opens the confirm dialog, naming the term being deleted. */
    request: (name: string) => void;
    /** The dialog element — render it once in the component tree (it portals to the body). */
    dialog: ReactNode;
}

/**
 * Shared "are you sure?" gate for deleting a taxonomy term from the detail sheet. The management
 * pages each ship their own confirm dialog; the sheet reuses this single one so brand / category /
 * tag deletes are guarded identically and we don't fire a destructive mutation on the first click.
 */
export function useDeleteConfirm({ onConfirm, pending }: UseDeleteConfirmOptions): UseDeleteConfirm {
    const t = useTranslations("Products.list.taxonomyDelete");
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");

    const request = useCallback((termName: string) => {
        setName(termName);
        setOpen(true);
    }, []);

    const dialog = (
        <AlertDialog open={open} onOpenChange={(next) => (!next ? setOpen(false) : undefined)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("title")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("description", { name: name || t("untitled") })}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                        {t("cancel")}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => {
                            onConfirm();
                            setOpen(false);
                        }}
                    >
                        {pending ? t("pending") : t("confirm")}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return { request, dialog };
}
