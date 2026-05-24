"use client";

import { Tag, Trash2, UserCheck, UserX } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { DataTableBulkBar } from "#/components/data-table/data-table-bulk-bar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "#/components/ui/dialog";
import { useBulkCustomerAction } from "#/lib/queries/customers";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
    t: (key: string, values?: Record<string, string | number>) => string;
}

export function CustomerBulkActions({ selectedIds, onClear, t }: BulkActionsProps) {
    const [tagDialogMode, setTagDialogMode] = useState<"add" | "remove" | null>(null);
    const [tagInput, setTagInput] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const bulk = useBulkCustomerAction();
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));

    if (selectedIds.size === 0) return null;

    const submitTags = async () => {
        if (tagInput.trim().length === 0) return;
        const tags = tagInput
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        if (tagDialogMode === "add") {
            await bulk.mutateAsync({ tag_add: tags });
        } else {
            await bulk.mutateAsync({ tag_remove: tags });
        }
        setTagDialogMode(null);
        setTagInput("");
        onClear();
    };

    const submitStatus = async (status: "active" | "suspended") => {
        await bulk.mutateAsync({ status_change: status });
        onClear();
    };

    const submitDelete = async () => {
        await bulk.mutateAsync({ delete: ids });
        setDeleteOpen(false);
        onClear();
    };

    return (
        <>
            <DataTableBulkBar
                selectedCount={selectedIds.size}
                onClear={onClear}
                label={(count) => t("bulk.selectedCount", { count })}
                clearLabel={t("bulk.clear")}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-primary-foreground"
                            >
                                <Tag className="size-3.5 me-2" aria-hidden="true" />
                                {t("bulk.tags")}
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setTagDialogMode("add")}>{t("bulk.addTag")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTagDialogMode("remove")}>
                            {t("bulk.removeTag")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => submitStatus("suspended")}
                    disabled={bulk.isPending}
                >
                    <UserX className="size-3.5 me-2" aria-hidden="true" />
                    {t("bulk.suspend")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => submitStatus("active")}
                    disabled={bulk.isPending}
                >
                    <UserCheck className="size-3.5 me-2" aria-hidden="true" />
                    {t("bulk.activate")}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-primary-foreground"
                            >
                                …
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
                            <Trash2 className="size-3.5 me-2" aria-hidden="true" />
                            {t("bulk.delete")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </DataTableBulkBar>

            <Dialog open={tagDialogMode !== null} onOpenChange={(open) => !open && setTagDialogMode(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tagDialogMode === "add" ? t("bulk.addTag") : t("bulk.removeTag")}</DialogTitle>
                        <DialogDescription>{t("bulk.tagDialogHint")}</DialogDescription>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="vip, b2b, wholesale"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTagDialogMode(null)}>
                            {t("bulk.cancel")}
                        </Button>
                        <Button onClick={submitTags} disabled={bulk.isPending}>
                            {t("bulk.apply")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("bulk.confirmDeleteTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("bulk.confirmDeleteBody", { count: selectedIds.size })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            {t("bulk.cancel")}
                        </Button>
                        <Button variant="destructive" onClick={submitDelete} disabled={bulk.isPending}>
                            {t("bulk.delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
