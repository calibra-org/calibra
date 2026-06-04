"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { ShieldAlert } from "#/icons";
import { stopImpersonationAction } from "#/lib/auth-actions";

/**
 * Exit button with a pending state, so a slow revoke shows progress instead of feeling stuck.
 * Revokes then navigates on the client: a server-action redirect would sub-render the destination
 * through Next's loopback origin and flash the platform "unknown shop". See the `redirectTo` note
 * on `loginAction`.
 */
function ExitButton() {
    const t = useTranslations("Impersonation");
    const [exiting, startExit] = useTransition();

    function exit() {
        startExit(async () => {
            const { redirectTo } = await stopImpersonationAction();
            window.location.assign(redirectTo);
        });
    }

    return (
        <button
            type="button"
            onClick={exit}
            disabled={exiting}
            className="rounded-md border border-warning-foreground/30 bg-warning-foreground/10 px-2.5 py-1 font-medium text-warning-foreground transition-colors hover:bg-warning-foreground/20 disabled:opacity-60"
        >
            {exiting ? t("exiting") : t("exit")}
        </button>
    );
}

/**
 * Persistent impersonation banner (RULE D). Rendered by the authenticated layout on **every**
 * authenticated route when `/auth/me` reports the session is an impersonation token — a platform
 * support operator "logged in as" this shop. Deliberately loud (amber, full-width, top of viewport)
 * so it can't be mistaken for a normal session, with an Exit control that revokes the token and
 * returns the operator to the control plane.
 */
export function ImpersonationBanner({ shopName }: { shopName: string }) {
    const t = useTranslations("Impersonation");
    return (
        <div
            role="alert"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-sm text-warning-foreground"
        >
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{t("banner", { shop: shopName })}</span>
            <ExitButton />
        </div>
    );
}
