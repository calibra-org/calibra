"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useDeferredValue, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Boxes, ExternalLink, PackageSearch, Search, Users } from "#/icons";
import { formatMoney } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { FactorHeader } from "./components";
import { useFactorCustomers, useFactorProducts } from "./queries";

export function FactorRecordsPage() {
    const locale = useLocale() as Locale;
    const [customerQuery, setCustomerQuery] = useState("");
    const [productQuery, setProductQuery] = useState("");
    const customers = useFactorCustomers(useDeferredValue(customerQuery));
    const products = useFactorProducts(useDeferredValue(productQuery));

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader
                title="مشتریان و کاتالوگ"
                subtitle="انتخاب مشتری و کالا از داده‌های زنده کالیبرا؛ اسناد قبلی با Snapshot مستقل و بدون تغییر باقی می‌مانند."
            />

            <Tabs defaultValue="customers" variant="line">
                <TabsList className="h-10 gap-6 px-0">
                    <TabsTrigger value="customers" className="gap-2 px-0">
                        <Users className="size-4" aria-hidden="true" />
                        مشتریان
                    </TabsTrigger>
                    <TabsTrigger value="catalog" className="gap-2 px-0">
                        <Boxes className="size-4" aria-hidden="true" />
                        محصولات و خدمات
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="customers" className="mt-5">
                    <Card>
                        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1.5">
                                <CardTitle className="text-base">مشتریان قابل استفاده در فاکتور</CardTitle>
                                <CardDescription>جست‌وجو روی نام، شماره تماس یا ایمیل مشتری انجام می‌شود.</CardDescription>
                            </div>
                            <Button variant="outline" asChild>
                                <Link href={"/customers" as never}>
                                    مدیریت کامل مشتریان
                                    <ExternalLink className="size-4" aria-hidden="true" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-xl">
                                <Search
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    value={customerQuery}
                                    onChange={(event) => setCustomerQuery(event.target.value)}
                                    className="ps-9"
                                    placeholder="نام، موبایل یا ایمیل مشتری..."
                                    aria-label="جستجو در مشتریان"
                                />
                            </div>

                            {customers.isLoading ? (
                                <ResourceSkeleton />
                            ) : customers.isError ? (
                                <ErrorState label="دریافت مشتریان" />
                            ) : (customers.data ?? []).length === 0 ? (
                                <EmptyState icon={Users} label="مشتری مطابق جست‌وجو پیدا نشد." />
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {(customers.data ?? []).map((customer) => (
                                        <article
                                            key={customer.id}
                                            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card p-4"
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <p className="truncate font-medium text-sm">
                                                    {customer.name || `مشتری #${customer.id}`}
                                                </p>
                                                <p className="truncate text-muted-foreground text-xs" dir="ltr">
                                                    {customer.phone ?? customer.email ?? "اطلاعات تماس ثبت نشده"}
                                                </p>
                                            </div>
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link href={`/customers/${customer.id}` as never}>پرونده</Link>
                                            </Button>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="catalog" className="mt-5">
                    <Card>
                        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1.5">
                                <CardTitle className="text-base">کاتالوگ متصل به فاکتور</CardTitle>
                                <CardDescription>
                                    قیمت و SKU از کاتالوگ خوانده می‌شود و هنگام صدور در ردیف سند Snapshot می‌گردد.
                                </CardDescription>
                            </div>
                            <Button variant="outline" asChild>
                                <Link href={"/products" as never}>
                                    مدیریت کامل محصولات
                                    <ExternalLink className="size-4" aria-hidden="true" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-xl">
                                <PackageSearch
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    value={productQuery}
                                    onChange={(event) => setProductQuery(event.target.value)}
                                    className="ps-9"
                                    placeholder="نام محصول یا SKU..."
                                    aria-label="جستجو در محصولات"
                                />
                            </div>

                            {products.isLoading ? (
                                <ResourceSkeleton />
                            ) : products.isError ? (
                                <ErrorState label="دریافت کاتالوگ" />
                            ) : (products.data ?? []).length === 0 ? (
                                <EmptyState icon={Boxes} label="محصول مطابق جست‌وجو پیدا نشد." />
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {(products.data ?? []).map((product) => (
                                        <article
                                            key={`${product.id}:${product.variation_id ?? "parent"}`}
                                            className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <p className="truncate font-medium text-sm">{product.name}</p>
                                                <p className="truncate text-muted-foreground text-xs" dir="ltr">
                                                    {product.sku
                                                        ? `SKU: ${product.sku}`
                                                        : product.variation_id
                                                          ? `Variation: ${product.variation_id}`
                                                          : `ID: ${product.id}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-semibold text-sm tabular-nums">
                                                    {formatMoney(product.unit_price_minor, locale)}
                                                </span>
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/products/${product.id}` as never}>مشاهده</Link>
                                                </Button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ResourceSkeleton() {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {["resource-1", "resource-2", "resource-3", "resource-4", "resource-5", "resource-6"].map((key) => (
                <Skeleton key={key} className="h-20 rounded-lg" />
            ))}
        </div>
    );
}

function ErrorState({ label }: { label: string }) {
    return (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger text-sm">
            {label} با خطا روبه‌رو شد. دوباره تلاش کنید.
        </div>
    );
}

function EmptyState({ icon: Icon, label }: { icon: typeof Users; label: string }) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{label}</p>
        </div>
    );
}
