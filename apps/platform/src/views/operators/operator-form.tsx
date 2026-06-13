"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogRoot, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useCreateOperator } from "#/lib/queries";
import type { OperatorCredentialReveal } from "#/lib/types";
import { CredentialRevealCard } from "#/views/operators/credential-reveal-card";

/**
 * Add-operator dialog. Collects an email and whether to issue a handoff link instead of revealing a
 * temp password, then surfaces the reveal-once credentials inline on success.
 */
export function OperatorForm({
    tenantId,
    open,
    onOpenChange,
}: {
    tenantId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const t = useTranslations("Operators");
    const create = useCreateOperator(tenantId);
    const [email, setEmail] = useState("");
    const [handoff, setHandoff] = useState(false);
    const [revealed, setRevealed] = useState<OperatorCredentialReveal | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        const res = await create.mutateAsync({ email, handoff });
        setRevealed(res.credentials);
    }

    function reset() {
        setEmail("");
        setHandoff(false);
        setRevealed(null);
    }

    return (
        <DialogRoot
            open={open}
            onOpenChange={(v) => {
                if (!v) reset();
                onOpenChange(v);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("addTitle")}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    {revealed ? (
                        <CredentialRevealCard
                            email={email}
                            tempPassword={revealed.temp_password}
                            handoffUrl={revealed.handoff_url}
                        />
                    ) : (
                        <form id="operator-form" onSubmit={onSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="op-email">{t("email")}</Label>
                                <Input
                                    id="op-email"
                                    type="email"
                                    dir="ltr"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="operator@shop.com"
                                />
                            </div>
                            <Label htmlFor="op-handoff" className="flex items-center gap-2 font-normal text-sm">
                                <Checkbox id="op-handoff" checked={handoff} onCheckedChange={(v) => setHandoff(Boolean(v))} />
                                {t("sendHandoff")}
                            </Label>
                        </form>
                    )}
                </DialogBody>
                <DialogFooter>
                    {revealed ? (
                        <Button onClick={() => onOpenChange(false)}>{t("done")}</Button>
                    ) : (
                        <Button type="submit" form="operator-form" disabled={create.isPending || email.length === 0}>
                            {t("addSubmit")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
