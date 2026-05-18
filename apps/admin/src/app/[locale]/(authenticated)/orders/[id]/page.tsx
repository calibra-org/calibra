import type { Locale } from "@calibra/shared/i18n";
import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AddressCard } from "#/components/AddressCard";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Separator } from "#/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { getOrder } from "#/lib/mock/repos";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const order = await getOrder(Number(id));
    if (order === null) return { title: "—" };
    const t = await getTranslations({ locale, namespace: "Orders.detail" });
    return { title: t("title", { number: order.orderNumber }) };
}

export default async function OrderDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const order = await getOrder(Number(id));
    if (order === null) notFound();
    const t = await getTranslations("Orders.detail");
    const tabs = t.raw("tabs") as Record<string, string>;
    const noteVisibility = t.raw("noteVisibility") as Record<string, string>;

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={
                    <span className="flex items-center gap-3">
                        {t("title", { number: order.orderNumber })}
                        <OrderStatusBadge status={order.status} />
                    </span>
                }
                subtitle={t("subtitle", { date: formatDateTime(order.createdAt, locale) })}
                actions={
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/customers/${order.customerId ?? 0}` as never}>{order.customerName}</Link>
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <Tabs defaultValue="items">
                    <TabsList>
                        <TabsTrigger value="items">{tabs.items}</TabsTrigger>
                        <TabsTrigger value="addresses">{tabs.addresses}</TabsTrigger>
                        <TabsTrigger value="history">{tabs.history}</TabsTrigger>
                        <TabsTrigger value="notes">{tabs.notes}</TabsTrigger>
                        <TabsTrigger value="refunds">{tabs.refunds}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="items">
                        <Card>
                            <CardHeader className="border-b pb-4">
                                <CardTitle className="text-sm">{t("items")}</CardTitle>
                            </CardHeader>
                            <CardContent className="px-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="px-5">{t("items")}</TableHead>
                                            <TableHead className="text-end">{/* qty */}</TableHead>
                                            <TableHead className="text-end">{/* unit */}</TableHead>
                                            <TableHead className="px-5 text-end">{/* total */}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {order.lineItems.map((line) => (
                                            <TableRow key={line.id}>
                                                <TableCell className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {line.imageUrl !== null ? (
                                                            // biome-ignore lint/performance/noImgElement: mock CDN
                                                            <img src={line.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                                                        ) : (
                                                            <div className="size-10 rounded-md bg-muted" aria-hidden="true" />
                                                        )}
                                                        <div className="flex flex-col">
                                                            <Link
                                                                href={`/products/${line.productId}` as never}
                                                                className="font-medium hover:underline"
                                                            >
                                                                {line.name[locale]}
                                                            </Link>
                                                            <span className="text-muted-foreground text-xs">{line.sku}</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-end text-muted-foreground">× {formatNumber(line.quantity, locale)}</TableCell>
                                                <TableCell className="text-end">{formatMoney(line.unitPrice, locale)}</TableCell>
                                                <TableCell className="px-5 text-end font-medium">{formatMoney(line.total, locale)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="addresses">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <AddressCard title={t("billing")} address={order.billingAddress} locale={locale} />
                            <AddressCard title={t("shipping")} address={order.shippingAddress} locale={locale} />
                        </div>
                    </TabsContent>

                    <TabsContent value="history">
                        <Card>
                            <CardHeader className="border-b pb-4">
                                <CardTitle className="text-sm">{t("history")}</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-5">
                                <ol className="relative flex flex-col gap-4 ps-6">
                                    {order.history.map((entry) => (
                                        <li key={entry.id} className="relative">
                                            <span className="absolute -start-6 top-1 grid size-3 place-items-center rounded-full bg-primary" aria-hidden="true">
                                                <span className="size-1.5 rounded-full bg-primary-foreground" />
                                            </span>
                                            <div className="flex items-center gap-2 text-sm">
                                                <OrderStatusBadge status={entry.toStatus} />
                                                <span className="text-muted-foreground text-xs">{formatDateTime(entry.occurredAt, locale)}</span>
                                            </div>
                                            {entry.changedBy !== null && (
                                                <div className="text-muted-foreground text-xs">
                                                    {entry.changedBy}
                                                    {entry.reason !== null && ` · ${entry.reason}`}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="notes">
                        <Card>
                            <CardHeader className="flex items-center justify-between border-b pb-4">
                                <CardTitle className="text-sm">{t("notes")}</CardTitle>
                                <Button variant="outline" size="sm">{t("addNote")}</Button>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4 pt-5">
                                {order.notes.length === 0 ? (
                                    <EmptyState icon={Clock} title={t("notes")} description="—" />
                                ) : (
                                    order.notes.map((note) => (
                                        <div key={note.id} className="rounded-md border border-border bg-muted/40 p-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-medium">{note.authorName}</span>
                                                <span className="text-muted-foreground">
                                                    {noteVisibility[note.visibility]} · {formatDateTime(note.createdAt, locale)}
                                                </span>
                                            </div>
                                            <p className="mt-1.5 text-sm">{note.body}</p>
                                        </div>
                                    ))
                                )}
                                <Separator />
                                <Textarea placeholder={t("addNote")} rows={3} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="refunds">
                        <Card>
                            <CardHeader className="border-b pb-4">
                                <CardTitle className="text-sm">{t("refunds")}</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-5">
                                {order.status === "refunded" ? (
                                    <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                                        {formatMoney(order.grandTotal, locale)} · {formatDateTime(order.createdAt, locale)}
                                    </div>
                                ) : (
                                    <EmptyState title={t("refunds")} description="—" />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <aside className="flex flex-col gap-4">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{t("summary")}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 pt-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("itemsTotal")}</span>
                                <span>{formatMoney(order.itemsTotal, locale)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("shippingTotal")}</span>
                                <span>{formatMoney(order.shippingTotal, locale)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("taxTotal")}</span>
                                <span>{formatMoney(order.taxTotal, locale)}</span>
                            </div>
                            {order.discountTotal > 0 && (
                                <div className="flex justify-between text-emerald-600">
                                    <span>{t("discountTotal")}</span>
                                    <span>− {formatMoney(order.discountTotal, locale)}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between text-base">
                                <span className="font-semibold">{t("grandTotal")}</span>
                                <span className="font-semibold">{formatMoney(order.grandTotal, locale)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{t("history")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 text-sm">
                            <ol className="flex flex-col gap-2">
                                {order.history.slice(-3).reverse().map((entry) => (
                                    <li key={`mini-${entry.id}`} className="flex items-center justify-between gap-2">
                                        <OrderStatusBadge status={entry.toStatus} />
                                        <span className="text-muted-foreground text-xs">{formatDateTime(entry.occurredAt, locale)}</span>
                                    </li>
                                ))}
                            </ol>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </section>
    );
}
