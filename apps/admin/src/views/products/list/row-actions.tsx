"use client";

import { Copy, ExternalLink, Eye, FilePen, Hash, Pencil, Trash2 } from "lucide-react";
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
import { useDuplicateProduct, useTrashProducts } from "#/lib/products/mutations";
import type { AdminProduct } from "#/lib/types";

interface RowActionsProps {
    product: AdminProduct;
    onQuickEdit: () => void;
    onOpenDetail: () => void;
}

/**
 * Per-row ⋯ menu. Wraps the generic {@link DataTableRowActions} so the product feature can host
 * the destructive confirmation locally — the abstraction stays free of feature-specific dialog
 * wiring.
 */
export function RowActions({ product, onQuickEdit, onOpenDetail }: RowActionsProps) {
    const t = useTranslations("Products.list");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const duplicateMutation = useDuplicateProduct();
    const trashMutation = useTrashProducts();

    const onCopyId = () => {
        void navigator.clipboard?.writeText(String(product.id));
        toast.add({ title: t("idCopied"), timeout: 2000, data: { tone: "success" } });
    };

    const onCopyLink = () => {
        void navigator.clipboard?.writeText(`/products/${product.id}`);
        toast.add({ title: t("linkCopied"), timeout: 2000, data: { tone: "success" } });
    };

    const onDuplicate = async () => {
        try {
            await duplicateMutation.mutateAsync({ id: product.id });
            toast.add({ title: t("duplicated"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("duplicateFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const onTrash = async () => {
        try {
            await trashMutation.mutateAsync({ ids: [product.id] });
            toast.add({ title: t("trashed"), timeout: 2500, data: { tone: "success" } });
            setConfirmOpen(false);
        } catch {
            toast.add({ title: t("trashFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    return (
        <>
            <DataTableRowActions label={t("rowActionsLabel")}>
                <DropdownMenuItem onClick={onOpenDetail}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {t("actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onQuickEdit}>
                    <FilePen className="size-3.5" aria-hidden="true" />
                    {t("actions.quickEdit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t("actions.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        window.open(`/product/${product.slug.fa}`, "_blank");
                    }}
                >
                    <Eye className="size-3.5" aria-hidden="true" />
                    {t("actions.view")}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        window.open(`/product/${product.slug.fa}`, "_blank");
                    }}
                >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {t("actions.openShop")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCopyLink}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t("actions.copyLink")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCopyId}>
                    <Hash className="size-3.5" aria-hidden="true" />
                    {t("actions.copyId")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => setConfirmOpen(true)}
                    className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("actions.trash")}
                </DropdownMenuItem>
            </DataTableRowActions>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("trashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("trashDescription", { name: product.name.fa })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={onTrash} disabled={trashMutation.isPending}>
                            {t("actions.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
