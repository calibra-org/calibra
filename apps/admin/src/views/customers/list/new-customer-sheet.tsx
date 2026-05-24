"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Radio, RadioGroup } from "#/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { useCreateCustomer } from "#/lib/queries/customers";
import { useRouter } from "#/lib/i18n/navigation";

const passwordRule = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

const formSchema = z
    .object({
        kind: z.enum(["guest", "account"]),
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().min(1).max(80),
        email: z.string().trim().email().optional().or(z.literal("")),
        password: z.string().optional().or(z.literal("")),
        phone: z.string().trim().min(4).max(32).optional().or(z.literal("")),
        country_default: z.string().trim().length(2),
    })
    .superRefine((values, ctx) => {
        if (values.kind === "account") {
            if (!values.email || values.email.length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "required" });
            }
            if (!values.password || !passwordRule.test(values.password)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "invalid" });
            }
        }
    });

type FormValues = z.infer<typeof formSchema>;

interface NewCustomerSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    t: (key: string, values?: Record<string, string | number>) => string;
}

export function NewCustomerSheet({ open, onOpenChange, t }: NewCustomerSheetProps) {
    const router = useRouter();
    const create = useCreateCustomer();
    const [successId, setSuccessId] = useState<number | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { kind: "guest", country_default: "IR", first_name: "", last_name: "", phone: "" },
    });

    const kind = watch("kind");
    const countryDefault = String(watch("country_default") ?? "IR");

    const submit = handleSubmit(async (values) => {
        const result = await create.mutateAsync({
            first_name: values.first_name,
            last_name: values.last_name,
            email: values.kind === "account" ? values.email : undefined,
            password: values.kind === "account" ? values.password : undefined,
            phone: values.phone && values.phone.length > 0 ? values.phone : undefined,
            country_default: values.country_default,
        });
        setSuccessId(Number(result.data.id));
        reset({ kind: "guest", country_default: "IR", first_name: "", last_name: "", phone: "" });
    });

    const closeAndReset = () => {
        setSuccessId(null);
        reset({ kind: "guest", country_default: "IR", first_name: "", last_name: "", phone: "" });
        onOpenChange(false);
    };

    return (
        <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : closeAndReset())}>
            <SheetContent className="w-full sm:max-w-lg flex flex-col gap-4 overflow-y-auto p-6">
                <SheetHeader>
                    <SheetTitle>{t("new.title")}</SheetTitle>
                    <SheetDescription>{t("new.subtitle")}</SheetDescription>
                </SheetHeader>

                {successId !== null ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                        <div className="text-lg font-semibold">{t("new.successTitle")}</div>
                        <div className="text-muted-foreground text-sm">{t("new.successBody")}</div>
                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={() => {
                                    router.push({ pathname: "/customers/[id]", params: { id: String(successId) } } as never);
                                }}
                            >
                                {t("new.openProfile")}
                            </Button>
                            <Button variant="outline" onClick={() => setSuccessId(null)}>
                                {t("new.addAnother")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
                        <fieldset className="flex flex-col gap-2">
                            <legend className="text-xs uppercase text-muted-foreground tracking-wide mb-1">
                                {t("new.kind")}
                            </legend>
                            <RadioGroup
                                value={kind}
                                onValueChange={(v) => setValue("kind", v as "guest" | "account")}
                                className="flex gap-4"
                            >
                                <label className="flex items-center gap-2 text-sm">
                                    <Radio value="guest" />
                                    {t("new.guest")}
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Radio value="account" />
                                    {t("new.hasAccount")}
                                </label>
                            </RadioGroup>
                        </fieldset>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="first_name">{t("new.firstName")}</Label>
                                <Input id="first_name" {...register("first_name")} />
                                {errors.first_name && (
                                    <span className="text-xs text-destructive">{t("new.required")}</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="last_name">{t("new.lastName")}</Label>
                                <Input id="last_name" {...register("last_name")} />
                                {errors.last_name && (
                                    <span className="text-xs text-destructive">{t("new.required")}</span>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="phone">{t("new.phone")}</Label>
                            <Input id="phone" type="tel" dir="ltr" {...register("phone")} placeholder="+98 912 345 6789" />
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="country_default">{t("new.country")}</Label>
                            <Select
                                value={countryDefault}
                                onValueChange={(v) => setValue("country_default", String(v))}
                            >
                                <SelectTrigger id="country_default">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IR">IR</SelectItem>
                                    <SelectItem value="US">US</SelectItem>
                                    <SelectItem value="DE">DE</SelectItem>
                                    <SelectItem value="GB">GB</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {kind === "account" && (
                            <>
                                <div className="flex flex-col gap-1">
                                    <Label htmlFor="email">{t("new.email")}</Label>
                                    <Input id="email" type="email" {...register("email")} dir="ltr" />
                                    {errors.email && <span className="text-xs text-destructive">{t("new.invalidEmail")}</span>}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label htmlFor="password">{t("new.password")}</Label>
                                    <Input id="password" type="password" {...register("password")} dir="ltr" />
                                    {errors.password && (
                                        <span className="text-xs text-destructive">{t("new.passwordRule")}</span>
                                    )}
                                </div>
                            </>
                        )}

                        <SheetFooter className="mt-auto flex-row justify-end gap-2 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={closeAndReset} disabled={isSubmitting}>
                                {t("new.cancel")}
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {t("new.create")}
                            </Button>
                        </SheetFooter>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    );
}
