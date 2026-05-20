"use client";

import { Copy, FolderTree, Star, Trash2, Wand2 } from "lucide-react";
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
import { useBulkUpdateProducts, useDuplicateProduct, useTrashProducts } from "#/lib/products/mutations";
import type { ProductStatus } from "#/lib/types";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
}

/**
 * Floating bulk-action pill rendered when ≥1 row is selected. Status changes go through
 * `POST /admin/products/batch`; duplicate and trash fall back to per-row calls because the API
 * doesn't expose a bulk-duplicate / bulk-trash shortcut.
 */
export function BulkActions({ selectedIds, onClear }: BulkActionsProps) {
    const t = useTranslations("Products.list");
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));
    const [trashOpen, setTrashOpen] = useState(false);

    const updateMutation = useBulkUpdateProducts();
    const duplicateMutation = useDuplicateProduct();
    const trashMutation = useTrashProducts();

    const changeStatus = async (status: ProductStatus) => {
        try {
            await updateMutation.mutateAsync({ ids, status });
            toast.add({ title: t("bulkStatusChanged"), timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const duplicateAll = async () => {
        try {
            for (const id of ids) {
                await duplicateMutation.mutateAsync({ id });
            }
            toast.add({ title: t("bulkDuplicated"), timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const trashAll = async () => {
        try {
            await trashMutation.mutateAsync({ ids });
            toast.add({ title: t("bulkTrashed"), timeout: 2500, data: { tone: "success" } });
            onClear();
            setTrashOpen(false);
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
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
                        <DropdownMenuItem onClick={() => changeStatus("publish")}>{t("status.publish")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeStatus("draft")}>{t("status.draft")}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                    onClick={duplicateAll}
                    disabled={duplicateMutation.isPending}
                >
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t("bulk.duplicate")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                    onClick={() => {
                        toast.add({ title: t("bulkFavoritedTodo"), timeout: 2500, data: { tone: "info" } });
                    }}
                >
                    <Star className="size-3.5" aria-hidden="true" />
                    {t("bulk.favorite")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                    onClick={() => {
                        toast.add({ title: t("bulkCategoryTodo"), timeout: 2500, data: { tone: "info" } });
                    }}
                >
                    <FolderTree className="size-3.5" aria-hidden="true" />
                    {t("bulk.category")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-rose-100 hover:bg-rose-500/30 hover:text-background"
                    onClick={() => setTrashOpen(true)}
                >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("bulk.trash")}
                </Button>
            </DataTableBulkBar>

            <AlertDialog open={trashOpen} onOpenChange={setTrashOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkTrashTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("bulkTrashDescription", { count: ids.length })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setTrashOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={trashAll} disabled={trashMutation.isPending}>
                            {t("bulk.trash")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
