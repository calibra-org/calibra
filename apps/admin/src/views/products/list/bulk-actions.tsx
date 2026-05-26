"use client";

import { Copy, Eye, FolderTree, RotateCcw, Sparkles, Star, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DataTableBulkBar } from "#/components/ui/data-grid";
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
import {
    type CatalogVisibility,
    useBulkUpdateProducts,
    useDuplicateProduct,
    useForceDeleteProducts,
    useRestoreProducts,
    useTrashProducts,
} from "#/lib/products/mutations";
import type { ProductStatus, StockStatus } from "#/lib/types";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
    /** When true, the bar shows the trash-mode action set (Restore / Delete permanently). */
    onTrashTab?: boolean;
}

const STATUS_VALUES: ProductStatus[] = ["publish", "draft", "pending", "private"];
const VISIBILITY_VALUES: CatalogVisibility[] = ["visible", "catalog", "search", "hidden"];
const STOCK_VALUES: StockStatus[] = ["instock", "outofstock", "onbackorder"];

/**
 * Floating bulk-action pill rendered when ≥1 row is selected. Active-rows mode wires status,
 * visibility, stock, featured, category, duplicate, and trash. Trash-tab mode swaps the
 * destructive actions for Restore + Delete permanently.
 */
export function BulkActions({ selectedIds, onClear, onTrashTab = false }: BulkActionsProps) {
    const t = useTranslations("Products.list");
    const statusT = useTranslations("ProductStatus");
    const visibilityT = useTranslations("Products.list.filters.visibilityOption");
    const stockT = useTranslations("StockStatus");
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));
    const [trashOpen, setTrashOpen] = useState(false);
    const [forceOpen, setForceOpen] = useState(false);

    const updateMutation = useBulkUpdateProducts();
    const duplicateMutation = useDuplicateProduct();
    const trashMutation = useTrashProducts();
    const restoreMutation = useRestoreProducts();
    const forceMutation = useForceDeleteProducts();

    const runUpdate = async (
        payload: Partial<{
            status: ProductStatus;
            featured: boolean;
            catalogVisibility: CatalogVisibility;
            stockStatus: StockStatus;
        }>,
        successKey: "bulkStatusChanged" | "bulkFailed" = "bulkStatusChanged",
    ) => {
        try {
            await updateMutation.mutateAsync({ ids, ...payload });
            toast.add({ title: t(successKey), timeout: 2500, data: { tone: "success" } });
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

    const restoreAll = async () => {
        try {
            await restoreMutation.mutateAsync({ ids });
            toast.add({ title: t("bulkRestored"), timeout: 2500, data: { tone: "success" } });
            onClear();
        } catch {
            toast.add({ title: t("bulkFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const forceAll = async () => {
        try {
            const result = await forceMutation.mutateAsync({ ids });
            const skipped = result?.data?.skipped_force?.length ?? 0;
            if (skipped > 0) {
                toast.add({ title: t("bulkForceSkipped", { count: skipped }), timeout: 4000, data: { tone: "warning" } });
            } else {
                toast.add({ title: t("bulkForceDeleted"), timeout: 2500, data: { tone: "success" } });
            }
            onClear();
            setForceOpen(false);
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
                {onTrashTab ? (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                            onClick={restoreAll}
                            disabled={restoreMutation.isPending}
                        >
                            <RotateCcw className="size-3.5" aria-hidden="true" />
                            {t("bulk.restore")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-danger hover:bg-danger/30 hover:text-background"
                            onClick={() => setForceOpen(true)}
                        >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {t("bulk.deletePermanently")}
                        </Button>
                    </>
                ) : (
                    <>
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
                                {STATUS_VALUES.map((value) => (
                                    <DropdownMenuItem key={value} onClick={() => void runUpdate({ status: value })}>
                                        {statusT(value)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button
                                        {...props}
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                                    >
                                        <Eye className="size-3.5" aria-hidden="true" />
                                        {t("bulk.setVisibility")}
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="center" className="min-w-40">
                                {VISIBILITY_VALUES.map((value) => (
                                    <DropdownMenuItem key={value} onClick={() => void runUpdate({ catalogVisibility: value })}>
                                        {visibilityT(value)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button
                                        {...props}
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                                    >
                                        <Sparkles className="size-3.5" aria-hidden="true" />
                                        {t("bulk.setStock")}
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="center" className="min-w-40">
                                {STOCK_VALUES.map((value) => (
                                    <DropdownMenuItem key={value} onClick={() => void runUpdate({ stockStatus: value })}>
                                        {stockT(value)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-background hover:bg-background/10 hover:text-background"
                            onClick={() => void runUpdate({ featured: true })}
                        >
                            <Star className="size-3.5" aria-hidden="true" />
                            {t("bulk.setFeatured")}
                        </Button>
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
                            onClick={() => toast.add({ title: t("bulkCategoryTodo"), timeout: 2500, data: { tone: "info" } })}
                        >
                            <FolderTree className="size-3.5" aria-hidden="true" />
                            {t("bulk.category")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-danger hover:bg-danger/30 hover:text-background"
                            onClick={() => setTrashOpen(true)}
                        >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {t("bulk.trash")}
                        </Button>
                    </>
                )}
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

            <AlertDialog open={forceOpen} onOpenChange={setForceOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkForceTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("bulkForceDescription", { count: ids.length })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setForceOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" onClick={forceAll} disabled={forceMutation.isPending}>
                            {t("bulk.deletePermanently")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
