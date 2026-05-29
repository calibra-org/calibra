import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { getPaymentGateway } from "#/lib/server-repos";

interface PageProps {
    params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, code } = await params;
    const gateway = await getPaymentGateway(code);
    if (gateway === null) return { title: "—" };
    return { title: gateway.title[locale as Locale] };
}

export default async function PaymentGatewayDetailPage({ params }: PageProps) {
    const { locale: rawLocale, code } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const gateway = await getPaymentGateway(code);
    if (gateway === null) notFound();
    const t = await getTranslations("Payments.detail");
    const commonT = await getTranslations("Common");

    const isStub = gateway.implementationStatus === "stub";
    const stubTooltip = (await getTranslations("Payments"))("stub.tooltip");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title", { title: gateway.title[locale] })}
                subtitle={t("subtitle")}
                actions={<Button disabled={isStub}>{t("save")}</Button>}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="border-b pb-4">
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
                        <CardHeader className="border-b pb-4">
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
                                    <StatusBadge tone="warning">{(await getTranslations("Payments"))("stub.badge")}</StatusBadge>
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
