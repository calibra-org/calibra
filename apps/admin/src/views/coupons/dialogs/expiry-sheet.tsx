"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { Switch } from "#/components/ui/switch";

interface ExpirySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Current expiry as `YYYY-MM-DD` or empty string when never-expires. */
    currentExpiresAt: string;
    /** Apply handler — receives an ISO timestamp or null for never-expires. */
    onApply: (nextDate: string | null) => Promise<void>;
}

/**
 * Slide-out for adjusting a single coupon's expiry. Used from row actions and the editor's
 * overflow menu. The "never expires" switch hides the date input when on; flipping it off
 * restores the input pre-filled with the current expiry (or today + 30 days when previously
 * null).
 */
export function ExpirySheet({ open, onOpenChange, currentExpiresAt, onApply }: ExpirySheetProps) {
    const t = useTranslations("Coupons.expirySheet");
    const [neverExpires, setNeverExpires] = useState(currentExpiresAt === "");
    const [date, setDate] = useState(currentExpiresAt);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setNeverExpires(currentExpiresAt === "");
            setDate(currentExpiresAt || defaultExpiry());
        }
    }, [open, currentExpiresAt]);

    const submit = async () => {
        setSubmitting(true);
        try {
            await onApply(neverExpires ? null : `${date}T23:59:59.999Z`);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="end">
                <SheetHeader>
                    <SheetTitle>{t("title")}</SheetTitle>
                    <SheetDescription>{t("description")}</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 p-4">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{t("neverExpires")}</span>
                            <span className="text-muted-foreground text-xs">{t("neverExpiresHint")}</span>
                        </div>
                        <Switch checked={neverExpires} onCheckedChange={setNeverExpires} />
                    </div>
                    {!neverExpires && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="expiry-date">{t("date")}</Label>
                            <Input id="expiry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                    )}
                </div>
                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t("cancel")}
                    </Button>
                    <Button onClick={submit} disabled={submitting}>
                        {t("apply")}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

function defaultExpiry(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
}
