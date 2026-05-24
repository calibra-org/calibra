"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Mail, Phone } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatRelativeTime } from "#/lib/format";
import type { AdminCustomer } from "#/lib/types";

interface DetailHeaderProps {
    customer: AdminCustomer;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
    statusT: (key: string) => string;
    onSendReset?: () => void;
}

function Initials({ first, last }: { first: string; last: string }) {
    const value = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
    return (
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-base text-primary ring-1 ring-primary/20">
            {value}
        </span>
    );
}

/**
 * Detail-page header. Rolls its own layout instead of using `<PageHeader>` because the subtitle
 * slot here is a flex row of badges + contact chips — wrapping that in PageHeader's `<p>` would
 * nest a `<div>` inside a `<p>` and trip Next.js hydration.
 */
export function DetailHeader({ customer, locale, t, statusT, onSendReset }: DetailHeaderProps) {
    const memberSince = formatRelativeTime(customer.createdAt, locale);
    return (
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-3">
                    <Initials first={customer.firstName} last={customer.lastName} />
                    <div className="flex min-w-0 flex-col">
                        <h1 className="truncate font-semibold text-lg">
                            {customer.firstName} {customer.lastName}
                        </h1>
                        <span className="text-muted-foreground text-sm">{t("detail.subtitle", { since: memberSince })}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge
                        variant={
                            customer.status === "active"
                                ? "secondary"
                                : customer.status === "suspended"
                                  ? "destructive"
                                  : "outline"
                        }
                    >
                        {customer.hasAccount ? statusT(customer.status) : t("guest")}
                    </Badge>
                    {customer.nationalId !== null && (
                        <Badge variant="outline" dir="ltr">
                            {customer.nationalId}
                        </Badge>
                    )}
                    {customer.email && (
                        <a
                            href={`mailto:${customer.email}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground text-xs hover:bg-accent/80"
                        >
                            <Mail className="size-3.5" aria-hidden="true" />
                            {customer.email}
                        </a>
                    )}
                    {customer.phone && (
                        <a
                            href={`tel:${customer.phone}`}
                            dir="ltr"
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground text-xs hover:bg-accent/80"
                        >
                            <Phone className="size-3.5" aria-hidden="true" />
                            {customer.phone}
                        </a>
                    )}
                </div>
            </div>
            {onSendReset && customer.hasAccount && (
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={onSendReset}>
                        {t("detail.sendPasswordReset")}
                    </Button>
                </div>
            )}
        </header>
    );
}
