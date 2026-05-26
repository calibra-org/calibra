"use client";

import { CheckCircle2, Trash2, Undo2, Wand2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DataTableBulkBar } from "#/components/data-table";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { toast } from "#/components/ui/toast";
import { useBulkModerateReviews, useDeleteReviews, useRestoreReviews, useTrashReviews } from "#/lib/reviews/mutations";
import type { ReviewStatus } from "#/lib/types";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
    /**
     * Active tab — drives which destructive button is shown (Trash vs. Restore/Delete Permanently).
     */
    tabStatus: ReviewStatus | "any";
}

/**
 * Floating bulk-action pill rendered when ≥1 row is selected. Approve / Unapprove / Spam are
 * single-call PATCH loops; trash + restore go through the local store; delete-permanently fires
 * `DELETE /admin/reviews/{id}` per id.
 */
export function BulkActions({ selectedIds, onClear, tabStatus }: BulkActionsProps) {
    const t = useTranslations("Reviews.list");
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));
    const [confirmOpen, setConfirmOpen] = useState<"trash" | "delete" | undefined>(undefined);

    const moderateMutation = useBulkModerateReviews();
    const trashMutation = useTrashReviews();
    const restoreMutation = useRestoreReviews();
    const deleteMutation = useDeleteReviews();

    const setStatus = async (status: "approved" | "pending" | "rejected", okMessage: string) => {
        try {
            await moderateMutation.mutateAsync({ ids, status });
            toast.add({ title: okMessage, timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const trashAll = async () => {
        try {
            await trashMutation.mutateAsync({ ids });
            const trashedIds = [...ids];
            toast.add({
                title: t("bulkTrashedWithCount", { count: trashedIds.length }),
                timeout: 6000,
                data: {
                    tone: "success",
                    action: {
                        label: t("undo"),
                        onAction: () => {
                            void restoreMutation.mutateAsync({ ids: trashedIds });
                        },
                    },
                },
            });
            onClear();
            setConfirmOpen(undefined);
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const restoreAll = async () => {
        try {
            await restoreMutation.mutateAsync({ ids });
            toast.add({ title: t("bulkRestored"), timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const deleteAll = async () => {
        try {
            await deleteMutation.mutateAsync({ ids });
            toast.add({ title: t("bulkDeleted"), timeout: 2500, data: { tone: "success" } });
            onClear();
            setConfirmOpen(undefined);
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const inTrashTab = tabStatus === "trash";

    return (
        <>
            <DataTableBulkBar
                selectedCount={selectedIds.size}
                onClear={onClear}
                clearLabel={t("clearSelection")}
                label={(count) => t("selectedCount", { count })}
            >
                {!inTrashTab && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={(props) => (
                                <Button
                                    {...props}
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                                >
                                    <Wand2 className="size-3.5" aria-hidden="true" />
                                    {t("bulk.status")}
                                </Button>
                            )}
                        />
                        <DropdownMenuContent align="center" className="min-w-44">
                            <DropdownMenuItem onClick={() => setStatus("approved", t("bulkApproved"))}>
                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                {t("bulk.approve")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatus("pending", t("bulkUnapproved"))}>
                                <XCircle className="size-3.5" aria-hidden="true" />
                                {t("bulk.unapprove")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatus("rejected", t("bulkSpam"))}>
                                <XCircle className="size-3.5" aria-hidden="true" />
                                {t("bulk.spam")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                {inTrashTab && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                        onClick={restoreAll}
                        disabled={restoreMutation.isPending}
                    >
                        <Undo2 className="size-3.5" aria-hidden="true" />
                        {t("bulk.restore")}
                    </Button>
                )}
                {!inTrashTab && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-danger hover:bg-danger/30 hover:text-background"
                        onClick={() => setConfirmOpen("trash")}
                    >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {t("bulk.trash")}
                    </Button>
                )}
                {inTrashTab && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-danger hover:bg-danger/30 hover:text-background"
                        onClick={() => setConfirmOpen("delete")}
                    >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {t("bulk.delete")}
                    </Button>
                )}
            </DataTableBulkBar>

            <AlertDialog open={confirmOpen === "trash"} onOpenChange={(open) => !open && setConfirmOpen(undefined)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkTrashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("bulkTrashDescription", { count: ids.length })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmOpen(undefined)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={trashAll} disabled={trashMutation.isPending}>
                            {t("bulk.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmOpen === "delete"} onOpenChange={(open) => !open && setConfirmOpen(undefined)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkDeleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("bulkDeleteDescription", { count: ids.length })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmOpen(undefined)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={deleteAll} disabled={deleteMutation.isPending}>
                            {t("bulk.delete")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
