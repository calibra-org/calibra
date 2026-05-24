"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Mail, Phone } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PageHeader } from "#/components/PageHeader";
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
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary text-base ring-1 ring-primary/20">
            {value}
        </span>
    );
}

export function DetailHeader({ customer, locale, t, statusT, onSendReset }: DetailHeaderProps) {
    const memberSince = formatRelativeTime(customer.createdAt, locale);
    return (
        <PageHeader
            title={
                <div className="flex items-center gap-3">
                    <Initials first={customer.firstName} last={customer.lastName} />
                    <div className="flex flex-col">
                        <span className="text-lg font-semibold">
                            {customer.firstName} {customer.lastName}
                        </span>
                        <span className="text-muted-foreground text-sm">{t("subtitle", { since: memberSince })}</span>
                    </div>
                </div>
            }
            subtitle={
                <div className="flex flex-wrap items-center gap-2">
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
            }
            actions={
                onSendReset && customer.hasAccount ? (
                    <Button variant="outline" onClick={onSendReset}>
                        {t("detail.sendPasswordReset")}
                    </Button>
                ) : null
            }
        />
    );
}
