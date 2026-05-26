"use client";

import { Copy, Eye, FileText, Hash, Mail, Pencil, Printer, Trash2, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DataTableRowActions } from "#/components/data-table";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "#/components/ui/dropdown-menu";
import { toast } from "#/components/ui/toast";
import { useDeleteOrder, useMarkShipped, useResendConfirmation } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface RowActionsProps {
    order: AdminOrder;
    onOpenPreview: () => void;
    onOpenDetail: () => void;
}

/**
 * Per-row ⋯ menu. Mirrors the products row-actions pattern — destructive confirmation lives in
 * this file so the generic DataTableRowActions stays free of feature-specific dialog plumbing.
 */
export function RowActions({ order, onOpenPreview, onOpenDetail }: RowActionsProps) {
    const t = useTranslations("Orders.list");
    const [confirmTrash, setConfirmTrash] = useState(false);
    const resend = useResendConfirmation();
    const markShipped = useMarkShipped();
    const deleteOrder = useDeleteOrder();

    const onCopyNumber = () => {
        void navigator.clipboard?.writeText(`#${order.orderNumber}`);
        toast.add({ title: t("numberCopied"), timeout: 2000, data: { tone: "success" } });
    };

    const onCopyLink = () => {
        void navigator.clipboard?.writeText(`/orders/${order.id}`);
        toast.add({ title: t("linkCopied"), timeout: 2000, data: { tone: "success" } });
    };

    const onResend = async () => {
        try {
            await resend.mutateAsync({ id: order.id });
            toast.add({ title: t("confirmationResent"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("confirmationResendFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const onMarkShipped = async () => {
        try {
            await markShipped.mutateAsync({ id: order.id });
            toast.add({ title: t("markedShipped"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("markShippedFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const onTrash = async () => {
        try {
            await deleteOrder.mutateAsync({ id: order.id });
            toast.add({ title: t("trashed"), timeout: 2500, data: { tone: "success" } });
            setConfirmTrash(false);
        } catch {
            toast.add({ title: t("trashFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    return (
        <>
            <DataTableRowActions label={t("rowActionsLabel")}>
                <DropdownMenuItem onClick={onOpenDetail}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {t("actions.open")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenPreview}>
                    <Eye className="size-3.5" aria-hidden="true" />
                    {t("actions.quickPreview")}
                </DropdownMenuItem>
                {order.status === "processing" && (
                    <DropdownMenuItem onClick={onMarkShipped} disabled={markShipped.isPending}>
                        <Truck className="size-3.5" aria-hidden="true" />
                        {t("actions.markShipped")}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onResend} disabled={resend.isPending}>
                    <Mail className="size-3.5" aria-hidden="true" />
                    {t("actions.resendConfirmation")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.open(`/orders/${order.id}/invoice?print=1`, "_blank")}>
                    <Printer className="size-3.5" aria-hidden="true" />
                    {t("actions.printInvoice")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(`/orders/${order.id}/packing-slip?print=1`, "_blank")}>
                    <FileText className="size-3.5" aria-hidden="true" />
                    {t("actions.printPackingSlip")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCopyLink}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t("actions.copyLink")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCopyNumber}>
                    <Hash className="size-3.5" aria-hidden="true" />
                    {t("actions.copyNumber")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => setConfirmTrash(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("actions.trash")}
                </DropdownMenuItem>
            </DataTableRowActions>

            <AlertDialog open={confirmTrash} onOpenChange={setConfirmTrash}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("trashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("trashDescription", { number: String(order.orderNumber) })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmTrash(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={onTrash} disabled={deleteOrder.isPending}>
                            {t("actions.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
