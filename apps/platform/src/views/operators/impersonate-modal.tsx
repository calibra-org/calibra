"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button";
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogRoot, DialogTitle } from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { openImpersonationTab, useImpersonate } from "#/lib/queries";

/**
 * "Log in as" reason modal. A reason is required (enforced server-side too); on submit it mints the
 * 30-minute impersonation grant and opens the target's admin in a new tab.
 */
export function ImpersonateModal({
    tenantId,
    targetUserId,
    targetName,
    open,
    onOpenChange,
}: {
    tenantId: string;
    targetUserId: number | null;
    targetName?: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const t = useTranslations("Operators");
    const impersonate = useImpersonate(tenantId);
    const [reason, setReason] = useState("");

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        if (targetUserId === null) return;
        const grant = await impersonate.mutateAsync({ targetUserId, reason });
        openImpersonationTab(grant);
        setReason("");
        onOpenChange(false);
    }

    return (
        <DialogRoot
            open={open}
            onOpenChange={(v) => {
                if (!v) setReason("");
                onOpenChange(v);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{targetName ? t("impersonateTitleNamed", { name: targetName }) : t("impersonateTitle")}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <form id="impersonate-form" onSubmit={onSubmit} className="flex flex-col gap-2">
                        <Label htmlFor="imp-reason">{t("reason")}</Label>
                        <Textarea
                            id="imp-reason"
                            required
                            minLength={3}
                            rows={3}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t("reasonPlaceholder")}
                        />
                    </form>
                </DialogBody>
                <DialogFooter>
                    <Button
                        type="submit"
                        form="impersonate-form"
                        disabled={impersonate.isPending || reason.trim().length < 3 || targetUserId === null}
                    >
                        {t("impersonateConfirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
