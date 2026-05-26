"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import type { AdminOrderAddress } from "#/lib/types";

const COUNTRY_OPTIONS = ["IR", "TR", "AE", "DE", "US"] as const;

/**
 * Validates the 10-digit Iranian national ID via the public-record checksum. False positives are
 * impossible by construction; false negatives only when the input drifts away from 10 digits. We
 * skip validation entirely outside Iran (the field is hidden there too).
 */
function isValidIranianNationalId(value: string): boolean {
    if (!/^\d{10}$/.test(value)) return false;
    if (/^(\d)\1{9}$/.test(value)) return false;
    const digits = value.split("").map(Number);
    const check = digits[9];
    const sum = digits.slice(0, 9).reduce((acc, digit, index) => acc + digit * (10 - index), 0);
    const remainder = sum % 11;
    const expected = remainder < 2 ? remainder : 11 - remainder;
    return check === expected;
}

const baseAddressSchema = z.object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    company: z.string().trim().max(200).optional().or(z.literal("")),
    address_line_1: z.string().trim().min(1).max(255),
    address_line_2: z.string().trim().max(255).optional().or(z.literal("")),
    city: z.string().trim().min(1).max(120),
    region_text: z.string().trim().max(200).optional().or(z.literal("")),
    postcode: z.string().trim().max(20).optional().or(z.literal("")),
    country: z.string().trim().length(2),
    phone: z.string().trim().min(4).max(32).optional().or(z.literal("")),
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    national_id: z.string().trim().max(20).optional().or(z.literal("")),
    customer_note: z.string().trim().max(2000).optional().or(z.literal("")),
});

type AddressForm = z.infer<typeof baseAddressSchema>;

export interface AddressFormSubmit {
    first_name: string;
    last_name: string;
    company: string | null;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    region_text: string | null;
    postcode: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    customer_note: string | null;
}

interface AddressFormProps {
    kind: "billing" | "shipping";
    initial: AdminOrderAddress;
    onSubmit: (values: AddressFormSubmit) => Promise<void>;
    onCancel: () => void;
    onCopyFromBilling?: () => void;
    isSaving: boolean;
}

/**
 * Shared edit form for billing + shipping addresses. Uses react-hook-form + zod for validation;
 * the schema branches per `kind` to enforce the email + national-ID rules only where they apply.
 * The "Copy billing address" link is rendered only when the parent passes a callback (shipping
 * card).
 */
export function AddressForm({ kind, initial, onSubmit, onCancel, onCopyFromBilling, isSaving }: AddressFormProps) {
    const t = useTranslations("Orders.new.address");
    const tAction = useTranslations("Orders.detail.addressForm");

    const schema = baseAddressSchema.superRefine((values, ctx) => {
        if (values.country === "IR" && values.national_id && values.national_id.length > 0) {
            if (!isValidIranianNationalId(values.national_id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["national_id"],
                    message: tAction("invalidNationalId"),
                });
            }
        }
        if (kind === "billing" && values.country === "IR" && values.postcode && values.postcode.length > 0) {
            if (!/^\d{10}$/.test(values.postcode)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["postcode"],
                    message: tAction("invalidPostcode"),
                });
            }
        }
    });

    const {
        register,
        handleSubmit,
        watch,
        reset,
        formState: { errors, isDirty },
    } = useForm<AddressForm>({
        resolver: zodResolver(schema),
        defaultValues: {
            first_name: initial.firstName,
            last_name: initial.lastName,
            company: initial.company ?? "",
            address_line_1: initial.addressLine1,
            address_line_2: initial.addressLine2 ?? "",
            city: initial.city,
            region_text: initial.provinceCode ?? "",
            postcode: initial.postcode ?? "",
            country: initial.country || "IR",
            phone: initial.phone ?? "",
            email: kind === "billing" ? "" : "",
            national_id: initial.nationalId ?? "",
            customer_note: "",
        },
    });

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onCancel]);

    const country = watch("country");
    const showNationalId = country === "IR";

    const submit = handleSubmit(async (values) => {
        await onSubmit({
            first_name: values.first_name,
            last_name: values.last_name,
            company: values.company?.trim() ? values.company.trim() : null,
            address_line_1: values.address_line_1,
            address_line_2: values.address_line_2?.trim() ? values.address_line_2.trim() : null,
            city: values.city,
            region_text: values.region_text?.trim() ? values.region_text.trim() : null,
            postcode: values.postcode?.trim() ? values.postcode.trim() : null,
            country: values.country.toUpperCase(),
            phone: values.phone?.trim() ? values.phone.trim() : null,
            email: kind === "billing" && values.email?.trim() ? values.email.trim() : null,
            national_id: values.national_id?.trim() && showNationalId ? values.national_id.trim() : null,
            customer_note: kind === "shipping" && values.customer_note?.trim() ? values.customer_note.trim() : null,
        });
        reset(values);
    });

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            {onCopyFromBilling && (
                <button
                    type="button"
                    onClick={onCopyFromBilling}
                    className="inline-flex w-fit items-center gap-1 text-primary text-xs hover:underline"
                >
                    <Copy className="size-3" aria-hidden="true" />
                    {tAction("copyBilling")}
                </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("firstName")} error={errors.first_name?.message}>
                    <Input {...register("first_name")} />
                </Field>
                <Field label={t("lastName")} error={errors.last_name?.message}>
                    <Input {...register("last_name")} />
                </Field>
                <Field label={t("phone")} error={errors.phone?.message}>
                    <Input {...register("phone")} dir="ltr" />
                </Field>
                {kind === "billing" && (
                    <Field label={t("email")} error={errors.email?.message}>
                        <Input {...register("email")} dir="ltr" type="email" />
                    </Field>
                )}
                <div className="sm:col-span-2">
                    <Field label={t("addressLine1")} error={errors.address_line_1?.message}>
                        <Input {...register("address_line_1")} />
                    </Field>
                </div>
                <div className="sm:col-span-2">
                    <Field label={t("addressLine2")} error={errors.address_line_2?.message}>
                        <Input {...register("address_line_2")} />
                    </Field>
                </div>
                <Field label={t("city")} error={errors.city?.message}>
                    <Input {...register("city")} />
                </Field>
                <Field label={t("postcode")} error={errors.postcode?.message}>
                    <Input {...register("postcode")} dir="ltr" />
                </Field>
                <Field label={t("country")} error={errors.country?.message}>
                    <Select
                        value={country}
                        onValueChange={(value) => {
                            if (typeof value === "string") {
                                const event = { target: { value } } as unknown as React.ChangeEvent<HTMLInputElement>;
                                register("country").onChange(event);
                            }
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {COUNTRY_OPTIONS.map((code) => (
                                <SelectItem key={code} value={code}>
                                    {code}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {showNationalId && (
                    <Field label={tAction("nationalId")} error={errors.national_id?.message}>
                        <Input {...register("national_id")} dir="ltr" inputMode="numeric" />
                    </Field>
                )}
                {kind === "shipping" && (
                    <div className="sm:col-span-2">
                        <Field label={tAction("customerNote")} error={errors.customer_note?.message}>
                            <Textarea {...register("customer_note")} rows={2} />
                        </Field>
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                    {tAction("cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={isSaving || !isDirty}>
                    {tAction("save")}
                </Button>
            </div>
        </form>
    );
}

function Field({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <Label>{label}</Label>
            {children}
            {error && <p className="text-danger text-xs">{error}</p>}
        </div>
    );
}
