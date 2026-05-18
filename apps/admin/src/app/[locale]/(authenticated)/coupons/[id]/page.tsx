import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { InfoRow } from "#/components/InfoRow";
import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { formatDate, formatMoney, formatNumber, formatPercent } from "#/lib/format";
import { getCoupon } from "#/lib/mock/repos";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const coupon = await getCoupon(Number(id));
    if (coupon === null) return { title: "—" };
    const t = await getTranslations({ locale, namespace: "Coupons.detail" });
    return { title: t("title", { code: coupon.code }) };
}

export default async function CouponDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const coupon = await getCoupon(Number(id));
    if (coupon === null) notFound();
    const t = await getTranslations("Coupons.detail");
    const couponT = await getTranslations("Coupons");
    const typeT = couponT.raw("discountType") as Record<string, string>;
    const statusT = couponT.raw("status") as Record<string, string>;
    const usagePercent = coupon.usageLimitGlobal !== null ? (coupon.usageCount / coupon.usageLimitGlobal) * 100 : 0;

    const value =
        coupon.discountType === "percent"
            ? formatPercent(coupon.amountPercent ?? 0, locale)
            : coupon.discountType === "free_shipping"
              ? "—"
              : formatMoney(coupon.amountMinor ?? 0, locale);

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title", { code: coupon.code })}
                subtitle={
                    <span className="flex items-center gap-2">
                        <StatusBadge tone={coupon.status === "active" ? "success" : "neutral"}>
                            {statusT[coupon.status]}
                        </StatusBadge>
                        <span className="text-muted-foreground">{typeT[coupon.discountType]}</span>
                    </span>
                }
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-sm">{t("general")}</CardTitle>
                        <CardDescription>{coupon.description[locale]}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 text-sm">
                        <InfoRow label={couponT("table.value")} value={value} />
                        <InfoRow label={couponT("table.type")} value={typeT[coupon.discountType]} />
                        <InfoRow
                            label={couponT("table.expiresAt")}
                            value={coupon.expiresAt === null ? couponT("neverExpires") : formatDate(coupon.expiresAt, locale)}
                        />
                        <InfoRow label={t("globalLimit")} value={coupon.usageLimitGlobal === null ? "∞" : formatNumber(coupon.usageLimitGlobal, locale)} />
                        <InfoRow label={t("perUserLimit")} value={coupon.usageLimitPerUser === null ? "∞" : formatNumber(coupon.usageLimitPerUser, locale)} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-sm">{t("constraints")}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 text-sm">
                        <InfoRow
                            label={t("minimumAmount")}
                            value={coupon.minimumAmount === null ? "—" : formatMoney(coupon.minimumAmount, locale)}
                        />
                        <InfoRow
                            label={t("maximumAmount")}
                            value={coupon.maximumAmount === null ? "—" : formatMoney(coupon.maximumAmount, locale)}
                        />
                        <InfoRow label={couponT("table.usage")} value={formatNumber(coupon.usageCount, locale)} />
                        <InfoRow label="Free shipping" value={coupon.freeShipping ? "✓" : "—"} />
                        <InfoRow label="Individual use" value={coupon.individualUse ? "✓" : "—"} />
                        <InfoRow label="Exclude sale items" value={coupon.excludeSaleItems ? "✓" : "—"} />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-sm">{t("usage")}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-5">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t("totalUses")}</span>
                            <span className="font-medium">
                                {formatNumber(coupon.usageCount, locale)}
                                {coupon.usageLimitGlobal !== null ? ` / ${formatNumber(coupon.usageLimitGlobal, locale)}` : ""}
                            </span>
                        </div>
                        {coupon.usageLimitGlobal !== null && <Progress value={usagePercent} />}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}
