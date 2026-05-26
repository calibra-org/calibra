"use client";

import { Calendar, CircleSlash, CopyPlus, Power, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { DataTableBulkBar } from "#/components/ui/data-grid/data-table-bulk-bar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useBulkUpdateCoupons } from "#/lib/queries/coupons";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
    /** When `tab === "trashed"` we only show Restore + Final delete. */
    tab: string;
    t: (key: string, values?: Record<string, string | number>) => string;
}

/**
 * Bulk action bar for the coupons list. Renders different action sets based on the active tab:
 * on the trashed tab only restore + final-delete are exposed; everywhere else the operator sees
 * status toggles, expiry adjustments, duplication, and soft-delete. Each action calls
 * `POST /admin/coupons/batch` with the appropriate triplet.
 */
export function CouponBulkActions({ selectedIds, onClear, tab, t }: BulkActionsProps) {
    const ids = Array.from(selectedIds, (raw) => Number(raw)).filter((n) => Number.isFinite(n));
    const bulk = useBulkUpdateCoupons();

    const [expiryOpen, setExpiryOpen] = useState(false);
    const [expiryDate, setExpiryDate] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");

    if (selectedIds.size === 0) return null;

    const setStatus = async (status: "active" | "disabled") => {
        await bulk.mutateAsync({ update: ids.map((id) => ({ id, status })) });
        onClear();
    };

    const applyExpiry = async () => {
        const iso = expiryDate === "" ? null : `${expiryDate}T23:59:59.999Z`;
        await bulk.mutateAsync({ update: ids.map((id) => ({ id, expires_at: iso })) });
        setExpiryOpen(false);
        setExpiryDate("");
        onClear();
    };

    const softDelete = async () => {
        await bulk.mutateAsync({ delete: ids });
        onClear();
    };

    const submitFinalDelete = async () => {
        if (confirmText !== t("bulk.confirmDeleteKeyword")) return;
        /** Final delete uses the same backend route as soft-delete; the controller will mark them deleted_at.
         * A "really delete" SQL truncate is intentionally not exposed — operators recover via restore. */
        await bulk.mutateAsync({ delete: ids });
        setDeleteOpen(false);
        setConfirmText("");
        onClear();
    };

    const restore = async () => {
        await bulk.mutateAsync({ update: ids.map((id) => ({ id, status: "disabled" as const })) });
        onClear();
    };

    if (tab === "trashed") {
        return (
            <DataTableBulkBar
                selectedCount={selectedIds.size}
                onClear={onClear}
                label={(count) => t("bulk.selectedCount", { count })}
                clearLabel={t("bulk.clear")}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={restore}
                    disabled={bulk.isPending}
                >
                    <Power className="me-2 size-3.5" aria-hidden="true" />
                    {t("bulk.restore")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => setDeleteOpen(true)}
                    disabled={bulk.isPending}
                >
                    <Trash2 className="me-2 size-3.5" aria-hidden="true" />
                    {t("bulk.finalDelete")}
                </Button>

                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t("bulk.confirmFinalDeleteTitle")}</DialogTitle>
                            <DialogDescription>
                                {t("bulk.confirmFinalDeleteBody", {
                                    count: selectedIds.size,
                                    keyword: t("bulk.confirmDeleteKeyword"),
                                })}
                            </DialogDescription>
                        </DialogHeader>
                        <Input
                            autoFocus
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={t("bulk.confirmDeleteKeyword")}
                        />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                                {t("bulk.cancel")}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={submitFinalDelete}
                                disabled={bulk.isPending || confirmText !== t("bulk.confirmDeleteKeyword")}
                            >
                                {t("bulk.finalDelete")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DataTableBulkBar>
        );
    }

    return (
        <>
            <DataTableBulkBar
                selectedCount={selectedIds.size}
                onClear={onClear}
                label={(count) => t("bulk.selectedCount", { count })}
                clearLabel={t("bulk.clear")}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => setStatus("active")}
                    disabled={bulk.isPending}
                >
                    <Power className="me-2 size-3.5" aria-hidden="true" />
                    {t("bulk.activate")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => setStatus("disabled")}
                    disabled={bulk.isPending}
                >
                    <CircleSlash className="me-2 size-3.5" aria-hidden="true" />
                    {t("bulk.disable")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary-foreground"
                    onClick={() => setExpiryOpen(true)}
                    disabled={bulk.isPending}
                >
                    <Calendar className="me-2 size-3.5" aria-hidden="true" />
                    {t("bulk.setExpiry")}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={(props) => (
                            <Button {...props} type="button" variant="ghost" size="sm" className="text-primary-foreground">
                                …
                            </Button>
                        )}
                    />
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={softDelete} disabled={bulk.isPending}>
                            <Trash2 className="me-2 size-3.5" aria-hidden="true" />
                            {t("bulk.delete")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-muted-foreground">
                            <CopyPlus className="me-2 size-3.5" aria-hidden="true" />
                            {t("bulk.duplicateHint")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </DataTableBulkBar>

            <Dialog open={expiryOpen} onOpenChange={setExpiryOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("bulk.setExpiry")}</DialogTitle>
                        <DialogDescription>{t("bulk.setExpiryHint", { count: selectedIds.size })}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="bulk-expiry">{t("bulk.expiryDate")}</Label>
                        <Input
                            id="bulk-expiry"
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExpiryOpen(false)}>
                            {t("bulk.cancel")}
                        </Button>
                        <Button onClick={applyExpiry} disabled={bulk.isPending || expiryDate === ""}>
                            {t("bulk.apply")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
