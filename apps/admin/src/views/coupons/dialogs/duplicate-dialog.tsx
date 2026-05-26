"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useRouter } from "#/lib/i18n/navigation";
import { type CouponWritePayload, useCouponCodeCheck, useCreateCoupon } from "#/lib/queries/coupons";
import type { AdminCoupon } from "#/lib/types";

interface DuplicateCouponDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** `null` while the dialog is closed-and-idle — the dialog stays mounted so its entry transition plays. */
    sourceCoupon: AdminCoupon | null;
    sourcePayload: CouponWritePayload | null;
}

/**
 * Opens from the row actions menu (and the editor overflow). Pre-fills the new code as
 * `<original>-COPY` and disables the result by default so the operator can review before it
 * goes live. Live-uniqueness probe lights the input red if the suggested code is itself taken.
 * On success the dialog closes and the router redirects to the new coupon's edit page.
 */
export function DuplicateCouponDialog({ open, onOpenChange, sourceCoupon, sourcePayload }: DuplicateCouponDialogProps) {
    const t = useTranslations("Coupons.duplicateDialog");
    const router = useRouter();
    const create = useCreateCoupon();
    const [code, setCode] = useState("");

    useEffect(() => {
        if (open && sourceCoupon !== null) setCode(`${sourceCoupon.code}-COPY`);
        if (!open) setCode("");
    }, [open, sourceCoupon]);

    const codeCheck = useCouponCodeCheck(code, open && code.length >= 2);
    const blocked = codeCheck.data?.available === false;

    const submit = async () => {
        if (sourcePayload === null) return;
        const payload: CouponWritePayload = {
            ...sourcePayload,
            code: code.trim().toUpperCase(),
            /** Duplicates ship disabled by default — the operator opens the new coupon to review and flip on. */
            status: "disabled",
        };
        const result = await create.mutateAsync(payload);
        onOpenChange(false);
        router.push(`/coupons/${result.data.id}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description", { code: sourceCoupon?.code ?? "" })}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="duplicate-code">{t("fields.code")}</Label>
                    <Input
                        id="duplicate-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className="font-mono"
                        autoFocus
                    />
                    {blocked && (
                        <p className="text-destructive text-xs">
                            {codeCheck.data?.suggestion
                                ? t("codeTakenWithSuggestion", { suggestion: codeCheck.data.suggestion })
                                : t("codeTaken")}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t("cancel")}
                    </Button>
                    <Button onClick={submit} disabled={blocked || code.length < 2 || create.isPending}>
                        {t("duplicate")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
