"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { toast } from "#/components/ui/toast";
import { useRouter } from "#/lib/i18n/navigation";
import { useDeleteOrder, useMarkShipped, useResendConfirmation } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface ActionsCardProps {
    order: AdminOrder;
}

type ActionKey = "resend_confirmation" | "mark_shipped" | "print_invoice" | "print_packing" | "";

/**
 * Sidebar action menu — WP's "Order actions" metabox. A single Select chooses what to do, the
 * adjacent button runs it. The trash action lives below the divider so it never sits next to the
 * routine actions. Print actions open in a new tab with `?print=1` so they auto-print.
 */
export function ActionsCard({ order }: ActionsCardProps) {
    const t = useTranslations("Orders.detail.actionsCard");
    const tList = useTranslations("Orders.list");
    const router = useRouter();
    const resend = useResendConfirmation();
    const markShipped = useMarkShipped();
    const deleteOrder = useDeleteOrder();
    const [action, setAction] = useState<ActionKey>("");
    const [confirmTrash, setConfirmTrash] = useState(false);

    const run = async () => {
        switch (action) {
            case "resend_confirmation":
                try {
                    await resend.mutateAsync({ id: order.id });
                    toast.add({ title: tList("confirmationResent"), timeout: 2500, data: { tone: "success" } });
                } catch {
                    toast.add({ title: tList("confirmationResendFailed"), timeout: 3500, data: { tone: "error" } });
                }
                break;
            case "mark_shipped":
                try {
                    await markShipped.mutateAsync({ id: order.id });
                    toast.add({ title: tList("markedShipped"), timeout: 2500, data: { tone: "success" } });
                } catch {
                    toast.add({ title: tList("markShippedFailed"), timeout: 3500, data: { tone: "error" } });
                }
                break;
            case "print_invoice":
                window.open(`/orders/${order.id}/invoice?print=1`, "_blank");
                break;
            case "print_packing":
                window.open(`/orders/${order.id}/packing-slip?print=1`, "_blank");
                break;
        }
    };

    const onTrash = async () => {
        try {
            await deleteOrder.mutateAsync({ id: order.id });
            toast.add({ title: tList("trashed"), timeout: 2500, data: { tone: "success" } });
            router.push("/orders?status=trashed" as never);
        } catch {
            toast.add({ title: tList("trashFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-2">
                <label className="text-muted-foreground text-xs" htmlFor="order-action">
                    {t("placeholder")}
                </label>
                <Select
                    value={action}
                    onValueChange={(value) => setAction(typeof value === "string" ? (value as ActionKey) : "")}
                >
                    <SelectTrigger id="order-action">
                        <SelectValue placeholder={t("placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="resend_confirmation">{t("options.resend_confirmation")}</SelectItem>
                        <SelectItem value="mark_shipped">{t("options.mark_shipped")}</SelectItem>
                        <SelectItem value="print_invoice">{t("options.print_invoice")}</SelectItem>
                        <SelectItem value="print_packing">{t("options.print_packing")}</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={run} disabled={action === ""} className="self-start">
                    {t("apply")}
                </Button>
            </div>
            <Separator />
            <button
                type="button"
                className="inline-flex w-fit items-center gap-1 text-danger text-xs hover:underline"
                onClick={() => setConfirmTrash(true)}
            >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t("trash")}
            </button>

            <AlertDialog open={confirmTrash} onOpenChange={setConfirmTrash}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tList("trashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {tList("trashDescription", { number: String(order.orderNumber) })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmTrash(false)}>
                            {tList("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={onTrash} disabled={deleteOrder.isPending}>
                            {t("trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
