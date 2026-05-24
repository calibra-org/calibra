"use client";

import { Mail, Printer, Trash2, Wand2 } from "lucide-react";
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
import { useBulkUpdateOrders } from "#/lib/queries/orders";
import type { OrderStatus } from "#/lib/types";

const BULK_STATUS_TARGETS: OrderStatus[] = ["processing", "completed", "on_hold", "cancelled"];

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
}

/**
 * Floating bulk-action pill rendered when ≥1 row is selected. Status changes batch through one
 * `POST /orders/{id}/status` per row inside the mutation (the state machine validates each), the
 * trash action goes through `POST /orders/batch` in one shot. Print + resend are deferred for now
 * (no batch endpoint) — they degrade to per-row work the operator triggers from the row menu.
 */
export function BulkActions({ selectedIds, onClear }: BulkActionsProps) {
    const t = useTranslations("Orders.list");
    const statusT = useTranslations("OrderStatus");
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));
    const [confirmTrash, setConfirmTrash] = useState(false);

    const bulkMutation = useBulkUpdateOrders();

    const changeStatus = async (status: OrderStatus) => {
        try {
            await bulkMutation.mutateAsync({
                statusChanges: ids.map((id) => ({ id, to_status: status, reason: "bulk action" })),
            });
            toast.add({ title: t("bulkStatusChanged"), timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const trashAll = async () => {
        try {
            await bulkMutation.mutateAsync({ deleteIds: ids });
            toast.add({ title: t("bulkTrashed"), timeout: 2500, data: { tone: "success" } });
            onClear();
            setConfirmTrash(false);
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const printAll = () => {
        for (const id of ids) {
            window.open(`/orders/${id}/invoice?print=1`, "_blank");
        }
    };

    return (
        <>
            <DataTableBulkBar
                selectedCount={selectedIds.size}
                onClear={onClear}
                clearLabel={t("clearSelection")}
                label={(count) => t("selectedCount", { count })}
            >
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
                    <DropdownMenuContent align="center" className="min-w-40">
                        {BULK_STATUS_TARGETS.map((status) => (
                            <DropdownMenuItem key={status} onClick={() => changeStatus(status)}>
                                {statusT(status)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                    onClick={printAll}
                >
                    <Printer className="size-3.5" aria-hidden="true" />
                    {t("bulk.print")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                    onClick={() => toast.add({ title: t("bulkEmailTodo"), timeout: 2500, data: { tone: "info" } })}
                >
                    <Mail className="size-3.5" aria-hidden="true" />
                    {t("bulk.resendConfirmation")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-rose-100 hover:bg-rose-500/30 hover:text-background"
                    onClick={() => setConfirmTrash(true)}
                >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("bulk.trash")}
                </Button>
            </DataTableBulkBar>

            <AlertDialog open={confirmTrash} onOpenChange={setConfirmTrash}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkTrashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("bulkTrashDescription", { count: String(ids.length) })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmTrash(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={trashAll} disabled={bulkMutation.isPending}>
                            {t("bulk.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
