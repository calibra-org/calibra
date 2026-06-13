"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { changePasswordAction, setPasswordAction } from "#/lib/auth-actions";

const initialState: { ok: boolean; error: string | null; redirectTo?: string } = { ok: false, error: null };

/**
 * Shared password form for the two forced-credential flows: `set` consumes an operator handoff token
 * (unauthenticated), `change` clears the forced-change gate for the logged-in operator. Navigation is
 * client-side (full-document assign) so the destination renders against the shop's own `Host`.
 */
export function PasswordSetForm({ mode, token, locale }: { mode: "set" | "change"; token?: string; locale: string }) {
    const t = useTranslations("Password");
    const action = mode === "set" ? setPasswordAction : changePasswordAction;
    const [state, formAction, pending] = useActionState(action, initialState);

    useEffect(() => {
        if (state.ok && state.redirectTo) window.location.assign(state.redirectTo);
    }, [state.ok, state.redirectTo]);

    return (
        <form action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="__locale" value={locale} />
            {mode === "set" ? <input type="hidden" name="token" value={token ?? ""} /> : null}

            <div className="flex flex-col gap-1.5 text-sm">
                <Label htmlFor="new-password">{t("newPassword")}</Label>
                <Input
                    id="new-password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    aria-invalid={state.error !== null}
                />
                <span className="text-muted-foreground text-xs">{t("rule")}</span>
            </div>

            {state.error !== null && (
                <p role="alert" className="text-danger text-sm">
                    {state.error}
                </p>
            )}

            <Button type="submit" className="mt-1" disabled={pending || state.ok}>
                {pending || state.ok ? "…" : t("submit")}
            </Button>
        </form>
    );
}
