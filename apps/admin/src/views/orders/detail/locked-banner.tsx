"use client";

import { Lock, Unlock } from "lucide-react";
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
import { Input } from "#/components/ui/input";
import { toast } from "#/components/ui/toast";
import { useUpdateOrderHeader } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface LockedBannerProps {
    order: AdminOrder;
}

/**
 * Yellow warning strip rendered above the section grid when an order is auto-locked. The "Edit
 * anyway" affordance type-to-confirms with the literal text "UNLOCK" so the operator can't
 * fat-finger past it.
 */
export function LockedBanner({ order }: LockedBannerProps) {
    const t = useTranslations("Orders.detail.lockedBanner");
    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const mutation = useUpdateOrderHeader();

    if (!order.isLocked) return null;

    const REQUIRED = "UNLOCK";

    const unlock = async () => {
        if (confirmText !== REQUIRED) return;
        try {
            await mutation.mutateAsync({ id: order.id, is_locked: false });
            toast.add({ title: t("unlocked"), timeout: 2500, data: { tone: "success" } });
            setOpen(false);
            setConfirmText("");
        } catch {
            toast.add({ title: t("unlockFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning dark:text-warning">
                <div className="flex items-center gap-2">
                    <Lock className="size-4" aria-hidden="true" />
                    <p>{t("title")}</p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="border-warning/50 bg-warning/0 text-warning hover:bg-warning/15 dark:text-warning"
                    onClick={() => setOpen(true)}
                >
                    <Unlock className="size-3.5" aria-hidden="true" />
                    {t("unlock")}
                </Button>
            </div>

            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("confirmDescription", { token: REQUIRED })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        value={confirmText}
                        onChange={(event) => setConfirmText(event.target.value)}
                        placeholder={REQUIRED}
                        className="font-mono"
                    />
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button variant="destructive" disabled={confirmText !== REQUIRED || mutation.isPending} onClick={unlock}>
                            {t("unlock")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
