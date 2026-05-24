"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { toast } from "#/components/ui/toast";
import {
    useConvertCustomerToAccount,
    useImpersonateCustomer,
    useSendPasswordReset,
    useUpdateCustomerStatus,
} from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

interface ActionsCardProps {
    customer: AdminCustomer;
    locale: Locale;
    t: (key: string) => string;
}

/**
 * Resolves the storefront origin for impersonation. The spin script provisions admin + api but not
 * a web service, so `NEXT_PUBLIC_WEB_BASE_URL` is often unset; rather than building an invalid
 * `http:/` URL we fall back to swapping the admin port for the conventional web port (`13153 → 13154`),
 * matching the spin's ALLOWED_ORIGINS list. Returns `null` when we genuinely cannot resolve.
 */
function resolveStorefrontOrigin(): string | null {
    const envUrl = process.env.NEXT_PUBLIC_WEB_BASE_URL;
    if (typeof envUrl === "string" && envUrl.length > 1 && envUrl !== "/") {
        return envUrl.replace(/\/+$/, "");
    }
    if (typeof window === "undefined") return null;
    try {
        const here = new URL(window.location.origin);
        const adminPort = Number(here.port);
        if (Number.isFinite(adminPort) && adminPort > 0) {
            here.port = String(adminPort + 1);
        }
        return here.origin;
    } catch {
        return null;
    }
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
        const storefront = resolveStorefrontOrigin();
        if (storefront === null) {
            try {
                await navigator.clipboard.writeText(res.data.token);
            } catch {
                /** ignore — toast still informs the operator. */
            }
            toast.add({
                title: t("detail.impersonateNoStorefrontTitle"),
                data: { tone: "warning" },
                timeout: 6000,
            });
            return;
        }
        const params = new URLSearchParams({ [res.data.token_query_param]: res.data.token });
        window.open(`${storefront}/?${params.toString()}`, "_blank", "noopener,noreferrer");
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
                        <DialogDescription>{t("detail.convertDialog.hint")}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 py-2">
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="convert-email">{t("detail.convertDialog.email")}</Label>
                            <Input
                                id="convert-email"
                                type="email"
                                dir="ltr"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="convert-password">{t("detail.convertDialog.password")}</Label>
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
