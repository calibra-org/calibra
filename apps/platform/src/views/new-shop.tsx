"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { ConsoleSelect } from "#/components/ConsoleSelect";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ArrowStart, CheckCircle2 } from "#/icons";
import { ApiError } from "#/lib/api-client";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { type ProvisionInput, usePlans, useProvisionTenant } from "#/lib/queries";
import type { TenantDetail } from "#/lib/types";

const SHOP_SUFFIX = "shops.calibra.app";

export function NewShopView() {
    const t = useTranslations("NewShop");
    const router = useRouter();
    const plans = usePlans();
    const provision = useProvisionTenant();

    const [form, setForm] = useState<ProvisionInput>({
        slug: "",
        name: "",
        plan_key: "",
        currency_code: "IRR",
        primary_locale: "fa",
        owner_email: "",
    });
    const [created, setCreated] = useState<(TenantDetail & { shop_url: string }) | null>(null);
    const [error, setError] = useState<string | null>(null);

    const planKey = form.plan_key || plans.data?.[0]?.key || "";

    function set<K extends keyof ProvisionInput>(key: K, value: ProvisionInput[K]) {
        setForm((f) => ({ ...f, [key]: value }));
    }

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        try {
            const result = await provision.mutateAsync({ ...form, plan_key: planKey });
            setCreated(result);
        } catch (err) {
            setError(err instanceof ApiError ? extractError(err) : String(err));
        }
    }

    if (created) {
        return (
            <div className="mx-auto max-w-lg">
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <CheckCircle2 className="size-10 text-success-foreground" aria-hidden="true" />
                        <div>
                            <h2 className="font-semibold text-lg">{t("success")}</h2>
                            <p className="mt-1 text-muted-foreground text-sm">{t("successBody", { name: created.name })}</p>
                        </div>
                        <code className="rounded bg-muted px-2 py-1 text-xs" dir="ltr">
                            {created.shop_url}
                        </code>
                        <div className="flex gap-2">
                            <Button asChild>
                                <Link href={`/tenants/${created.id}`}>{t("viewDetail")}</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <a href={created.shop_url} target="_blank" rel="noopener">
                                    {t("openShop")}
                                </a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-lg">
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push("/tenants")}>
                <ArrowStart className="size-4" aria-hidden="true" />
            </Button>
            <PageHeader title={t("title")} description={t("subtitle")} />

            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={onSubmit} className="flex flex-col gap-4">
                        <Field label={t("slug")} hint={`${form.slug || "your-shop"}.${SHOP_SUFFIX}`}>
                            <Input
                                required
                                dir="ltr"
                                value={form.slug}
                                onChange={(e) => set("slug", e.target.value.toLowerCase())}
                                placeholder="aurora"
                            />
                        </Field>
                        <Field label={t("name")}>
                            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("plan")}>
                                <ConsoleSelect
                                    ariaLabel={t("plan")}
                                    value={planKey}
                                    onValueChange={(v) => set("plan_key", v)}
                                    options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))}
                                />
                            </Field>
                            <Field label={t("currency")}>
                                <ConsoleSelect
                                    ariaLabel={t("currency")}
                                    value={form.currency_code}
                                    onValueChange={(v) => set("currency_code", v)}
                                    options={[
                                        { value: "IRR", label: "IRR" },
                                        { value: "IRT", label: "IRT" },
                                    ]}
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("locale")}>
                                <ConsoleSelect
                                    ariaLabel={t("locale")}
                                    value={form.primary_locale ?? "fa"}
                                    onValueChange={(v) => set("primary_locale", v)}
                                    options={[
                                        { value: "fa", label: "fa" },
                                        { value: "en", label: "en" },
                                    ]}
                                />
                            </Field>
                            <Field label={t("ownerEmail")}>
                                <Input
                                    type="email"
                                    dir="ltr"
                                    value={form.owner_email}
                                    onChange={(e) => set("owner_email", e.target.value)}
                                    placeholder="owner@shop.com"
                                />
                            </Field>
                        </div>

                        {error ? (
                            <p role="alert" className="text-danger text-sm">
                                {error}
                            </p>
                        ) : null}

                        <Button type="submit" disabled={provision.isPending} className="mt-1">
                            {provision.isPending ? "…" : t("submit")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label>{label}</Label>
            {children}
            {hint ? (
                <span className="text-muted-foreground text-xs" dir="ltr">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

function extractError(err: ApiError): string {
    const body = err.body as { errors?: { message?: string }[] } | null;
    return body?.errors?.[0]?.message ?? `Error ${err.status}`;
}
