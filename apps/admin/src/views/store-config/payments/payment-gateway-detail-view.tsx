"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { usePaymentGateway } from "#/lib/queries/payments";

/**
 * Payment-gateway detail screen — the per-PSP configuration form. Resolves the gateway by `code` from
 * the cached gateways list (`usePaymentGateway`): `undefined` while loading renders a skeleton, `null`
 * (unknown code) renders a not-found state, and a resolved gateway renders the editable config. Stub
 * gateways disable the enable toggle and save button behind an explanatory tooltip.
 */
export function PaymentGatewayDetailView({ code }: { code: string }) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Payments.detail");
    const commonT = useTranslations("Common");
    const paymentsT = useTranslations("Payments");
    const { data: gateway, isLoading } = usePaymentGateway(code);

    if (isLoading || gateway === undefined) {
        return (
            <section className="flex flex-col gap-6">
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
                    <Skeleton className="h-80 w-full rounded-xl" />
                </div>
            </section>
        );
    }

    if (gateway === null) {
        return (
            <section className="flex flex-col gap-6">
                <PageHeader title={paymentsT("title")} subtitle={paymentsT("subtitle")} />
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
                    <p className="text-muted-foreground text-sm">{commonT("noResults")}</p>
                </div>
            </section>
        );
    }

    const isStub = gateway.implementationStatus === "stub";
    const stubTooltip = paymentsT("stub.tooltip");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title", { title: gateway.title[locale] })}
                subtitle={t("subtitle")}
                actions={<Button disabled={isStub}>{t("save")}</Button>}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t("configuration")}</CardTitle>
                        <CardDescription>{gateway.description[locale]}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                        <div className="flex items-center justify-between md:col-span-2">
                            <Label htmlFor={`enabled-${gateway.code}`} className="text-sm">
                                {commonT("enabled")}
                            </Label>
                            {isStub ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger className="inline-flex items-center" aria-label={stubTooltip}>
                                            <Switch id={`enabled-${gateway.code}`} defaultChecked={false} disabled />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">{stubTooltip}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : (
                                <Switch id={`enabled-${gateway.code}`} defaultChecked={gateway.enabled} />
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                            <Label htmlFor={`title-${gateway.code}`}>Title</Label>
                            <Input id={`title-${gateway.code}`} defaultValue={gateway.title[locale]} />
                        </div>
                        {Object.entries(gateway.settings).map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-1.5">
                                <Label htmlFor={`gw-${gateway.code}-${key}`}>{key}</Label>
                                <Input id={`gw-${gateway.code}-${key}`} defaultValue={value} />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{t("customerInstructions")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-5">
                            <Textarea defaultValue={gateway.customerInstructions[locale]} rows={6} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="flex flex-col gap-2 pt-6 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{commonT("active")}</span>
                                {isStub ? (
                                    <StatusBadge tone="warning">{paymentsT("stub.badge")}</StatusBadge>
                                ) : (
                                    <StatusBadge tone={gateway.enabled ? "success" : "neutral"}>
                                        {gateway.enabled ? commonT("enabled") : commonT("disabled")}
                                    </StatusBadge>
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Refunds</span>
                                <span>{gateway.supportsRefunds ? "✓" : "—"}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    );
}
