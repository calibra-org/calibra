"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { loginAction } from "#/lib/auth-actions";

interface LoginFormProps {
    locale: string;
}

const initialState: { ok: boolean; error: string | null } = { ok: false, error: null };

export function LoginForm({ locale }: LoginFormProps) {
    const t = useTranslations("Login");
    const [state, formAction, pending] = useActionState(loginAction, initialState);

    return (
        <form action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="__locale" value={locale} />

            <div className="flex flex-col gap-1.5 text-sm">
                <Label htmlFor="login-email">{t("email")}</Label>
                <Input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    defaultValue="admin@bulk.calibra.dev"
                    aria-invalid={state.error !== null}
                />
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
                <Label htmlFor="login-password">{t("password")}</Label>
                <Input
                    id="login-password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    defaultValue="Passw0rd1!"
                    aria-invalid={state.error !== null}
                />
            </div>

            {state.error !== null && (
                <p role="alert" className="text-danger text-sm">
                    {state.error}
                </p>
            )}

            <Button type="submit" className="mt-1" disabled={pending}>
                {pending ? "…" : t("submit")}
            </Button>

            <p className="text-center text-muted-foreground text-xs">{t("demoNotice")}</p>
        </form>
    );
}
