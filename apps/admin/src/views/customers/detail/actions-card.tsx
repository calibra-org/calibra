"use client";

import { useState } from "react";

import { Button } from "#/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
    useConvertCustomerToAccount,
    useImpersonateCustomer,
    useSendPasswordReset,
    useUpdateCustomerStatus,
} from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

interface ActionsCardProps {
    customer: AdminCustomer;
    t: (key: string) => string;
}

export function ActionsCard({ customer, t }: ActionsCardProps) {
    const [convertOpen, setConvertOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const status = useUpdateCustomerStatus(customer.id);
    const reset = useSendPasswordReset(customer.id);
    const impersonate = useImpersonateCustomer(customer.id);
    const convert = useConvertCustomerToAccount(customer.id);

    const onSuspend = async () => {
        try {
            await status.mutateAsync({ status: "suspended" });
        } catch (err) {
            const s = (err as { status?: number }).status;
            if (s === 409 && confirm(t("rowActions.suspendActiveOrdersConfirm"))) {
                await status.mutateAsync({ status: "suspended", force: true });
            }
        }
    };

    const onActivate = () => status.mutate({ status: "active" });
    const onReset = () => reset.mutate();
    const onImpersonate = async () => {
        const res = await impersonate.mutateAsync();
        const params = new URLSearchParams({ [res.data.token_query_param]: res.data.token });
        const storefront = process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "/";
        window.open(`${storefront}/?${params.toString()}`, "_blank");
    };
    const onSubmitConvert = async () => {
        await convert.mutateAsync({ email, password: password.length > 0 ? password : undefined });
        setConvertOpen(false);
        setEmail("");
        setPassword("");
    };

    return (
        <>
            <div className="flex flex-col gap-2 text-sm">
                {customer.hasAccount ? (
                    <>
                        {customer.status === "active" ? (
                            <Button variant="outline" onClick={onSuspend} disabled={status.isPending}>
                                {t("rowActions.suspend")}
                            </Button>
                        ) : (
                            <Button variant="outline" onClick={onActivate} disabled={status.isPending}>
                                {t("rowActions.activate")}
                            </Button>
                        )}
                        <Button variant="outline" onClick={onReset} disabled={reset.isPending}>
                            {t("detail.sendPasswordReset")}
                        </Button>
                        <Button variant="outline" onClick={onImpersonate} disabled={impersonate.isPending}>
                            {t("detail.loginAsCustomer")}
                        </Button>
                    </>
                ) : (
                    <Button onClick={() => setConvertOpen(true)}>{t("detail.convertToAccount")}</Button>
                )}
            </div>

            <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("detail.convertToAccount")}</DialogTitle>
                        <DialogDescription>Provide an email + password to create the linked account.</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 py-2">
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="convert-email">Email</Label>
                            <Input
                                id="convert-email"
                                type="email"
                                dir="ltr"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="convert-password">Password</Label>
                            <Input
                                id="convert-password"
                                type="password"
                                dir="ltr"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button onClick={onSubmitConvert} disabled={convert.isPending}>
                            {t("detail.convertToAccount")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
