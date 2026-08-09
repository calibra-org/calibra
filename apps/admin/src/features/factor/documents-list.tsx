"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useDeferredValue, useState } from "react";

import { StatCard } from "#/components/StatCard";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { AlertCircle, Banknote, Clock3, FileCheck2, FileText, Search } from "#/icons";
import { formatDate, formatMoney } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { FactorCreateButton, FactorEmptyState, FactorHeader, FactorStatusBadge } from "./components";
import { useFactorDocuments, useFactorSummary } from "./queries";
import { FACTOR_TYPE_LABELS } from "./utils";
import type { FactorStatus, FactorType } from "./types";

export function FactorDocumentsList() {
    const locale = useLocale() as Locale;
    const [q, setQ] = useState("");
    const [type, setType] = useState<FactorType | "all">("all");
    const [status, setStatus] = useState<FactorStatus | "all">("all");
    const [sort, setSort] = useState<"created_desc" | "created_asc" | "due_asc" | "amount_desc">("created_desc");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [page, setPage] = useState(1);
    const deferredQ = useDeferredValue(q.trim());
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;
    const documents = useFactorDocuments({ q: deferredQ, type, status, sort, from, to, page, limit: 25 });
    const summary = useFactorSummary();

    const rows = documents.data?.data ?? [];
    const total = documents.data?.meta.total ?? 0;

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader
                title="فاکتورها و پیش‌فاکتورها"
                subtitle="ساخت، ارسال، وصول و پیگیری اسناد مالی متصل به سفارش‌ها، مشتریان و کاتالوگ"
                actions={<FactorCreateButton />}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {summary.isLoading ? (
                    ["summary-1", "summary-2", "summary-3", "summary-4"].map((key) => <Skeleton key={key} className="h-24" />)
                ) : (
                    <>
                        <StatCard
                            label="کل اسناد"
                            value={String(summary.data?.total_documents ?? 0)}
                            icon={FileText}
                            tone="info"
                        />
                        <StatCard
                            label="مبلغ وصول‌شده"
                            value={formatMoney(summary.data?.collected_minor ?? 0, locale)}
                            icon={FileCheck2}
                            tone="success"
                        />
                        <StatCard
                            label="مانده وصول"
                            value={formatMoney(summary.data?.outstanding_minor ?? 0, locale)}
                            icon={Banknote}
                            tone="warning"
                        />
                        <StatCard
                            label="سررسید گذشته"
                            value={String(summary.data?.overdue_count ?? 0)}
                            description={formatMoney(summary.data?.overdue_minor ?? 0, locale)}
                            icon={Clock3}
                            tone="danger"
                        />
                    </>
                )}
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={q}
                                onChange={(event) => {
                                    setQ(event.target.value);
                                    setPage(1);
                                }}
                                placeholder="جستجو در شماره سند، مشتری، ایمیل یا تلفن"
                                aria-label="جستجو در اسناد"
                                className="ps-9"
                            />
                        </div>
                        <Select
                            value={type}
                            onValueChange={(value) => {
                                setType(value as FactorType | "all");
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-44" aria-label="فیلتر نوع سند">
                                <SelectValue placeholder="نوع سند" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همه نوع‌ها</SelectItem>
                                <SelectItem value="proforma">پیش‌فاکتور</SelectItem>
                                <SelectItem value="invoice">فاکتور</SelectItem>
                                <SelectItem value="credit_note">سند اصلاحی</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value as FactorStatus | "all");
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-48" aria-label="فیلتر وضعیت سند">
                                <SelectValue placeholder="وضعیت" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                                <SelectItem value="draft">پیش‌نویس</SelectItem>
                                <SelectItem value="sent">ارسال‌شده</SelectItem>
                                <SelectItem value="viewed">دیده‌شده</SelectItem>
                                <SelectItem value="awaiting">در انتظار پرداخت</SelectItem>
                                <SelectItem value="paid">پرداخت‌شده</SelectItem>
                                <SelectItem value="expired">منقضی</SelectItem>
                                <SelectItem value="cancelled">لغوشده</SelectItem>
                                <SelectItem value="refunded">بازپرداخت‌شده</SelectItem>
                                <SelectItem value="credited">اصلاح‌شده</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => void documents.refetch()} disabled={documents.isFetching}>
                            به‌روزرسانی
                        </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem_auto]">
                        <Input
                            type="date"
                            value={fromDate}
                            onChange={(event) => {
                                setFromDate(event.target.value);
                                setPage(1);
                            }}
                            aria-label="از تاریخ"
                        />
                        <Input
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={(event) => {
                                setToDate(event.target.value);
                                setPage(1);
                            }}
                            aria-label="تا تاریخ"
                        />
                        <Select
                            value={sort}
                            onValueChange={(value) => {
                                setSort(value as typeof sort);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger aria-label="مرتب‌سازی اسناد">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="created_desc">جدیدترین</SelectItem>
                                <SelectItem value="created_asc">قدیمی‌ترین</SelectItem>
                                <SelectItem value="due_asc">نزدیک‌ترین سررسید</SelectItem>
                                <SelectItem value="amount_desc">بیشترین مبلغ</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setQ("");
                                setType("all");
                                setStatus("all");
                                setSort("created_desc");
                                setFromDate("");
                                setToDate("");
                                setPage(1);
                            }}
                            disabled={!q && type === "all" && status === "all" && sort === "created_desc" && !fromDate && !toDate}
                        >
                            پاک‌کردن فیلترها
                        </Button>
                    </div>

                    {documents.isError ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
                            <AlertCircle className="size-7 text-danger" aria-hidden="true" />
                            <p className="text-sm">دریافت فهرست اسناد ناموفق بود.</p>
                            <Button variant="outline" onClick={() => void documents.refetch()}>
                                تلاش دوباره
                            </Button>
                        </div>
                    ) : documents.isLoading ? (
                        <div className="space-y-2">
                            {[
                                "document-row-1",
                                "document-row-2",
                                "document-row-3",
                                "document-row-4",
                                "document-row-5",
                                "document-row-6",
                                "document-row-7",
                            ].map((key) => (
                                <Skeleton key={key} className="h-12" />
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <FactorEmptyState
                            title={
                                q || type !== "all" || status !== "all" || fromDate || toDate
                                    ? "سندی با این فیلتر پیدا نشد"
                                    : "هنوز سندی ساخته نشده است"
                            }
                            description="از این بخش می‌توانید پیش‌فاکتور، فاکتور نهایی و سند اصلاحی را به‌صورت یکپارچه مدیریت کنید."
                            action={!q && type === "all" && status === "all" && !fromDate && !toDate}
                        />
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>شماره سند</TableHead>
                                        <TableHead>مشتری</TableHead>
                                        <TableHead>نوع</TableHead>
                                        <TableHead>وضعیت</TableHead>
                                        <TableHead>مبلغ</TableHead>
                                        <TableHead>مانده</TableHead>
                                        <TableHead>تاریخ</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((document) => (
                                        <TableRow key={document.id}>
                                            <TableCell>
                                                <Link
                                                    href={`/factor/documents/${document.id}` as never}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    {document.reference ?? `پیش‌نویس #${document.id}`}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex min-w-36 flex-col">
                                                    <span className="font-medium text-sm">
                                                        {document.customer.name || "بدون نام"}
                                                    </span>
                                                    <span className="text-muted-foreground text-xs">
                                                        {document.customer.phone ?? document.customer.email ?? "—"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{FACTOR_TYPE_LABELS[document.type]}</TableCell>
                                            <TableCell>
                                                <FactorStatusBadge status={document.status} />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap font-medium tabular-nums">
                                                {formatMoney(document.payable_minor, locale)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatMoney(document.outstanding_minor, locale)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                                                {formatDate(document.created_at, locale)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
                        <span>{total.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} سند</span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                                disabled={page <= 1 || documents.isFetching}
                            >
                                قبلی
                            </Button>
                            <span>
                                صفحه {page.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} از{" "}
                                {(documents.data?.meta.lastPage ?? 1).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((value) => Math.min(documents.data?.meta.lastPage ?? value, value + 1))}
                                disabled={page >= (documents.data?.meta.lastPage ?? 1) || documents.isFetching}
                            >
                                بعدی
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
