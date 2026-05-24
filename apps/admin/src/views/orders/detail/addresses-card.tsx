"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
import { useUpdateOrderAddress } from "#/lib/queries/orders";
import type { AdminOrder, AdminOrderAddress } from "#/lib/types";

import { AddressForm, type AddressFormSubmit } from "./address-form";

interface AddressesCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Sidebar billing + shipping addresses with hover-pencil edit mode. Switching to edit replaces
 * the formatted block with the shared {@link AddressForm}; saving fires PATCH to the relevant
 * `/addresses/:kind` endpoint and returns to view mode. Shipping editor offers a "copy from
 * billing" link so admins don't retype the address twice.
 */
export function AddressesCard({ order, locale: _locale }: AddressesCardProps) {
    const t = useTranslations("Orders.detail");
    const tAction = useTranslations("Orders.detail.addressForm");
    const update = useUpdateOrderAddress();
    const [editing, setEditing] = useState<"billing" | "shipping" | null>(null);

    const handleSave = async (kind: "billing" | "shipping", values: AddressFormSubmit) => {
        try {
            await update.mutateAsync({ id: order.id, kind, address: values });
            toast.add({ title: tAction("saved"), timeout: 2500, data: { tone: "success" } });
            setEditing(null);
        } catch {
            toast.add({ title: tAction("saveFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <div className="flex flex-col gap-5 text-xs">
            <Block
                heading={t("billing")}
                address={order.billingAddress}
                editing={editing === "billing"}
                onEdit={() => setEditing("billing")}
                onCancel={() => setEditing(null)}
            >
                {editing === "billing" && (
                    <AddressForm
                        kind="billing"
                        initial={order.billingAddress}
                        onSubmit={(values) => handleSave("billing", values)}
                        onCancel={() => setEditing(null)}
                        isSaving={update.isPending}
                    />
                )}
            </Block>

            <Block
                heading={t("shipping")}
                address={order.shippingAddress}
                editing={editing === "shipping"}
                onEdit={() => setEditing("shipping")}
                onCancel={() => setEditing(null)}
            >
                {editing === "shipping" && (
                    <AddressForm
                        kind="shipping"
                        initial={order.shippingAddress}
                        onSubmit={(values) => handleSave("shipping", values)}
                        onCancel={() => setEditing(null)}
                        onCopyFromBilling={() => handleSave("shipping", addressToSubmit(order.billingAddress, "shipping"))}
                        isSaving={update.isPending}
                    />
                )}
            </Block>
        </div>
    );
}

interface BlockProps {
    heading: string;
    address: AdminOrderAddress;
    editing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    children: React.ReactNode;
}

function Block({ heading, address, editing, onEdit, onCancel: _onCancel, children }: BlockProps) {
    const tAction = useTranslations("Orders.detail.addressForm");
    if (editing) {
        return (
            <section className="flex flex-col gap-2">
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide">{heading}</h4>
                {children}
            </section>
        );
    }
    return (
        <section className="group/address relative flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide">{heading}</h4>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 opacity-0 transition-opacity group-focus-within/address:opacity-100 group-hover/address:opacity-100"
                    aria-label={tAction("edit")}
                    onClick={onEdit}
                >
                    <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
            </div>
            <AddressView address={address} />
        </section>
    );
}

function AddressView({ address }: { address: AdminOrderAddress }) {
    if (!address.firstName && !address.lastName && !address.addressLine1) {
        return <p className="text-muted-foreground">—</p>;
    }
    return (
        <div className="flex flex-col gap-0.5">
            <p className="text-sm">
                {address.firstName} {address.lastName}
            </p>
            {address.company && <p className="text-muted-foreground">{address.company}</p>}
            <p>{address.addressLine1}</p>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            <p className="text-muted-foreground">
                {address.city}
                {address.provinceCode ? ` · ${address.provinceCode}` : ""}
                {address.postcode ? ` · ${address.postcode}` : ""} · {address.country}
            </p>
            {address.phone && <p className="text-muted-foreground">{address.phone}</p>}
        </div>
    );
}

function addressToSubmit(address: AdminOrderAddress, kind: "billing" | "shipping"): AddressFormSubmit {
    return {
        first_name: address.firstName,
        last_name: address.lastName,
        company: address.company,
        address_line_1: address.addressLine1,
        address_line_2: address.addressLine2,
        city: address.city,
        region_text: address.provinceCode || null,
        postcode: address.postcode || null,
        country: address.country || "IR",
        phone: address.phone || null,
        email: null,
        national_id: address.nationalId,
        customer_note: kind === "shipping" ? null : null,
    };
}
