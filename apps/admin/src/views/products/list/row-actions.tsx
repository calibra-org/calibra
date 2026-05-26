"use client";

import { Copy, ExternalLink, Eye, FilePen, Hash, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import { useDuplicateProduct, useForceDeleteProducts, useRestoreProducts, useTrashProducts } from "#/lib/products/mutations";
import type { AdminProduct } from "#/lib/types";

interface RowActionsProps {
    product: AdminProduct;
    onQuickEdit: () => void;
    onOpenDetail: () => void;
}

/**
 * Per-row ⋯ menu. Adapts the action set based on whether the row is in trash:
 *   - Active rows: Edit / Quick edit / Duplicate / View / View on store / Copy link / Copy id / Trash
 *   - Trashed rows: Restore / Delete permanently
 *
 * Wraps the generic {@link DataTableRowActions} so feature-specific confirmations stay local.
 */
export function RowActions({ product, onQuickEdit, onOpenDetail }: RowActionsProps) {
    const t = useTranslations("Products.list");
    const [trashOpen, setTrashOpen] = useState(false);
    const [forceOpen, setForceOpen] = useState(false);
    const duplicateMutation = useDuplicateProduct();
    const trashMutation = useTrashProducts();
    const restoreMutation = useRestoreProducts();
    const forceMutation = useForceDeleteProducts();

    const isTrashed = product.deletedAt !== null && product.deletedAt !== undefined;
    const storefrontOrigin = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "";
    const storefrontUrl = `${storefrontOrigin}/product/${product.slug.fa}`;

    const onCopyId = () => {
        void navigator.clipboard?.writeText(String(product.id));
        toast.add({ title: t("idCopied"), timeout: 2000, data: { tone: "success" } });
    };

    const onCopyLink = () => {
        void navigator.clipboard?.writeText(storefrontUrl || `/products/${product.id}`);
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
            setTrashOpen(false);
        } catch {
            toast.add({ title: t("trashFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const onRestore = async () => {
        try {
            await restoreMutation.mutateAsync({ ids: [product.id] });
            toast.add({ title: t("restore.ok"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("restore.failed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const onForceDelete = async () => {
        try {
            await forceMutation.mutateAsync({ ids: [product.id] });
            toast.add({ title: t("forceDelete.ok"), timeout: 2500, data: { tone: "success" } });
            setForceOpen(false);
        } catch {
            toast.add({ title: t("forceDelete.failed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    return (
        <>
            <DataTableRowActions label={t("rowActionsLabel")}>
                {!isTrashed && (
                    <>
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
                        <DropdownMenuItem onClick={() => window.open(storefrontUrl || `/product/${product.slug.fa}`, "_blank")}>
                            <Eye className="size-3.5" aria-hidden="true" />
                            {t("actions.view")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(storefrontUrl || `/product/${product.slug.fa}`, "_blank")}>
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            {t("rowActions.viewOnStore")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onCopyLink}>
                            <Copy className="size-3.5" aria-hidden="true" />
                            {t("rowActions.copyLink")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onCopyId}>
                            <Hash className="size-3.5" aria-hidden="true" />
                            {t("actions.copyId")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setTrashOpen(true)}
                            className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                        >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {t("actions.trash")}
                        </DropdownMenuItem>
                    </>
                )}
                {isTrashed && (
                    <>
                        <DropdownMenuItem onClick={onRestore}>
                            <RotateCcw className="size-3.5" aria-hidden="true" />
                            {t("rowActions.restore")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setForceOpen(true)}
                            className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                        >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {t("rowActions.deletePermanently")}
                        </DropdownMenuItem>
                    </>
                )}
            </DataTableRowActions>

            <AlertDialog open={trashOpen} onOpenChange={setTrashOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("trashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("trashDescription", { name: product.name.fa })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setTrashOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={onTrash} disabled={trashMutation.isPending}>
                            {t("actions.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={forceOpen} onOpenChange={setForceOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("forceDelete.title")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("forceDelete.description", { name: product.name.fa })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setForceOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={onForceDelete} disabled={forceMutation.isPending}>
                            {t("forceDelete.confirm")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
