import type { Locale } from "@calibra/shared/i18n";
import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { InfoRow } from "#/components/InfoRow";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { PageHeader } from "#/components/PageHeader";
import { StatCard } from "#/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { getCustomer, listOrders } from "#/lib/mock/repos";
import type { AdminCustomerDownload, AdminOrder } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const customer = await getCustomer(Number(id));
    if (customer === null) return { title: "—" };
    return { title: `${customer.firstName} ${customer.lastName}` };
}

export default async function CustomerDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const customer = await getCustomer(Number(id));
    if (customer === null) notFound();
    const t = await getTranslations("Customers.detail");
    const ordersT = await getTranslations("Orders");
    const ordersCols = ordersT.raw("table") as Record<string, string>;
    const addressKind = t.raw("addressKind") as Record<string, string>;
    const downloadsCols = t.raw("downloadsTable") as Record<string, string>;
    const { data: allOrders } = await listOrders({ perPage: 100 });
    const customerOrders = allOrders.filter((order) => order.customerId === customer.id);

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={`${customer.firstName} ${customer.lastName}`}
                subtitle={t("subtitle", { since: formatDate(customer.createdAt, locale) })}
                actions={
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <a
                            href={`mailto:${customer.email}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground hover:bg-accent/80"
                        >
                            <Mail className="size-3.5" aria-hidden="true" />
                            {customer.email}
                        </a>
                        <a
                            href={`tel:${customer.phone}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground hover:bg-accent/80"
                        >
                            <Phone className="size-3.5" aria-hidden="true" />
                            <span dir="ltr">{customer.phone}</span>
                        </a>
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label={t("totalOrders")} value={formatNumber(customer.ordersCount, locale)} />
                <StatCard label={t("totalSpent")} value={formatMoney(customer.totalSpent, locale)} />
                <StatCard
                    label={t("averageOrder")}
                    value={formatMoney(
                        customer.ordersCount === 0 ? 0 : Math.round(customer.totalSpent / customer.ordersCount),
                        locale,
                    )}
                />
            </div>

            <Tabs defaultValue="profile">
                <TabsList>
                    <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
                    <TabsTrigger value="addresses">{t("addresses")}</TabsTrigger>
                    <TabsTrigger value="orders">{t("ordersTab")}</TabsTrigger>
                    <TabsTrigger value="downloads">{t("downloads")}</TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{t("profile")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2 text-sm">
                            <InfoRow label="Email" value={customer.email} />
                            <InfoRow label="Phone" value={<span dir="ltr">{customer.phone}</span>} />
                            <InfoRow label="National ID" value={customer.nationalId ?? "—"} />
                            <InfoRow label="Company" value={customer.companyName ?? "—"} />
                            <InfoRow label="Created" value={formatDate(customer.createdAt, locale)} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="addresses">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {customer.addresses.map((address) => (
                            <Card key={address.id}>
                                <CardHeader className="border-b pb-4">
                                    <CardTitle className="text-sm">
                                        {t("addressLabel", { label: address.label, kind: addressKind[address.kind] })}
                                    </CardTitle>
                                    {address.isDefault && <CardDescription>★ default</CardDescription>}
                                </CardHeader>
                                <CardContent className="flex flex-col gap-0.5 pt-4 text-sm">
                                    <div className="font-medium">
                                        {address.firstName} {address.lastName}
                                    </div>
                                    {address.company !== null && <div className="text-muted-foreground">{address.company}</div>}
                                    <div>{address.addressLine1}</div>
                                    {address.addressLine2 !== null && <div>{address.addressLine2}</div>}
                                    <div className="text-muted-foreground">
                                        {address.city}, {address.provinceCode} · {address.postcode}
                                    </div>
                                    <div className="text-muted-foreground">{address.country}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="orders">
                    <DataTable<AdminOrder>
                        columns={[
                            {
                                id: "order",
                                header: ordersCols.order,
                                cell: (row) => (
                                    <Link href={`/orders/${row.id}` as never} className="font-medium hover:underline">
                                        #{formatNumber(row.orderNumber, locale)}
                                    </Link>
                                ),
                            },
                            {
                                id: "total",
                                header: ordersCols.total,
                                cell: (row) => <span className="font-medium">{formatMoney(row.grandTotal, locale)}</span>,
                                className: "text-end",
                            },
                            { id: "status", header: ordersCols.status, cell: (row) => <OrderStatusBadge status={row.status} /> },
                            {
                                id: "placedAt",
                                header: ordersCols.placedAt,
                                cell: (row) => (
                                    <span className="text-muted-foreground text-xs">{formatDate(row.createdAt, locale)}</span>
                                ),
                            },
                        ]}
                        rows={customerOrders}
                        getRowKey={(row) => row.id}
                        emptyState={ordersT("empty")}
                    />
                </TabsContent>

                <TabsContent value="downloads">
                    {customer.downloads.length === 0 ? (
                        <Card>
                            <CardContent className="p-12 text-center text-muted-foreground text-sm">
                                {t("noDownloads")}
                            </CardContent>
                        </Card>
                    ) : (
                        <DataTable<AdminCustomerDownload>
                            columns={[
                                {
                                    id: "product",
                                    header: downloadsCols.product,
                                    cell: (row) => <span className="font-medium">{row.productName[locale]}</span>,
                                },
                                {
                                    id: "order",
                                    header: downloadsCols.order,
                                    cell: (row) => `#${formatNumber(row.orderNumber, locale)}`,
                                },
                                {
                                    id: "granted",
                                    header: downloadsCols.granted,
                                    cell: (row) => formatDate(row.grantedAt, locale),
                                },
                                {
                                    id: "expires",
                                    header: downloadsCols.expires,
                                    cell: (row) => (row.expiresAt === null ? "—" : formatDate(row.expiresAt, locale)),
                                },
                                {
                                    id: "used",
                                    header: downloadsCols.downloadsUsed,
                                    cell: (row) => formatNumber(row.downloadsUsed, locale),
                                    className: "text-end",
                                },
                                {
                                    id: "limit",
                                    header: downloadsCols.limit,
                                    cell: (row) => (row.downloadLimit === null ? "∞" : formatNumber(row.downloadLimit, locale)),
                                    className: "text-end",
                                },
                            ]}
                            rows={customer.downloads}
                            getRowKey={(row) => row.id}
                            emptyState="—"
                        />
                    )}
                </TabsContent>
            </Tabs>
        </section>
    );
}
