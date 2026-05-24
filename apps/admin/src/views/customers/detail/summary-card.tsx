"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { InfoRow } from "#/components/InfoRow";
import { formatDate } from "#/lib/format";
import { useUpdateCustomer } from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

interface SummaryCardProps {
    customer: AdminCustomer;
    locale: Locale;
    t: (key: string) => string;
}

export function SummaryCard({ customer, locale, t }: SummaryCardProps) {
    const [editing, setEditing] = useState(false);
    const [firstName, setFirstName] = useState(customer.firstName);
    const [lastName, setLastName] = useState(customer.lastName);
    const [phone, setPhone] = useState(customer.phone);
    const update = useUpdateCustomer(customer.id);

    useEffect(() => {
        if (!editing) {
            setFirstName(customer.firstName);
            setLastName(customer.lastName);
            setPhone(customer.phone);
        }
    }, [customer, editing]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setEditing(false);
        };
        if (editing) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [editing]);

    const save = async () => {
        await update.mutateAsync({
            first_name: firstName,
            last_name: lastName,
            phone: phone.length > 0 ? phone : null,
        });
        setEditing(false);
    };

    if (editing) {
        return (
            <section className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="first_name">First name</Label>
                        <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="last_name">Last name</Label>
                        <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="flex gap-2">
                    <Button onClick={save} disabled={update.isPending}>
                        {t("save")}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={update.isPending}>
                        {t("cancel")}
                    </Button>
                </div>
            </section>
        );
    }

    return (
        <section className="group/summary relative flex flex-col gap-1 text-sm">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-0 top-0 size-7 opacity-0 transition-opacity group-hover/summary:opacity-100 group-focus-within/summary:opacity-100"
                onClick={() => setEditing(true)}
                aria-label={t("edit")}
            >
                <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <InfoRow label="First name" value={customer.firstName} />
            <InfoRow label="Last name" value={customer.lastName} />
            <InfoRow label="Phone" value={customer.phone ? <span dir="ltr">{customer.phone}</span> : "—"} />
            <InfoRow label="Country" value={customer.acquisitionChannel ?? "—"} />
            <InfoRow label="Email" value={customer.email || "—"} />
            <InfoRow label="National ID" value={customer.nationalId ?? "—"} />
            <InfoRow label="Company" value={customer.companyName ?? "—"} />
            <InfoRow label="Created" value={formatDate(customer.createdAt, locale)} />
        </section>
    );
}
