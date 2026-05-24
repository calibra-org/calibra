"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { Button } from "#/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useOrder, useUpdateOrderStatus } from "#/lib/queries/orders";
import type { AdminOrder, OrderStatus } from "#/lib/types";

import { legalNextStatuses } from "../shared/status-machine";

interface QuickPreviewDrawerProps {
    order: AdminOrder | null;
    open: boolean;
    onOpenChange: (next: boolean) => void;
    locale: Locale;
    onNavigate: (direction: "prev" | "next") => void;
    /** True when the row strip has neighbours in that direction — disables the arrow when there's nothing to jump to. */
    canNavigate: { prev: boolean; next: boolean };
}

/**
 * Right-side preview drawer. Loads the full detail through `useOrder` so the tabs (items,
 * addresses, payment, timeline) render against the canonical envelope instead of the trimmed
 * list row. Status changes go through the optimistic mutation and reflect in the badge before
 * the network resolves. Arrow buttons step through neighbouring rows without closing the drawer.
 */
export function QuickPreviewDrawer({ order, open, onOpenChange, locale, onNavigate, canNavigate }: QuickPreviewDrawerProps) {
    const t = useTranslations("Orders.list.preview");
    const detailT = useTranslations("Orders.detail");
    const tStatus = useTranslations("OrderStatus");
    const fullQuery = useOrder(order?.id ?? 0);

    useEffect(() => {
        if (!open) return;
        const handler = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) return;
            if (event.key === "ArrowLeft") onNavigate(locale === "fa" ? "next" : "prev");
            if (event.key === "ArrowRight") onNavigate(locale === "fa" ? "prev" : "next");
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onNavigate, locale]);

    const detail = fullQuery.data ?? null;
    const view = detail ?? order;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full max-w-xl gap-0 p-0">
                {view === null ? (
                    <div className="flex flex-col gap-3 p-6">
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : (
                    <>
                        <SheetHeader className="border-border border-b p-6 pb-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <SheetTitle className="flex items-center gap-2">
                                        #{formatNumber(view.orderNumber, locale)}
                                        <OrderStatusBadge status={view.status} />
                                    </SheetTitle>
                                    <SheetDescription>
                                        {t("subtitle", {
                                            date: formatDateTime(view.createdAt, locale),
                                            total: formatMoney(view.grandTotal, locale),
                                        })}
                                    </SheetDescription>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-8"
                                        disabled={!canNavigate.prev}
                                        onClick={() => onNavigate("prev")}
                                        aria-label={t("previous")}
                                    >
                                        <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                                        <ChevronLeft className="hidden size-4 rtl:inline" aria-hidden="true" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-8"
                                        disabled={!canNavigate.next}
                                        onClick={() => onNavigate("next")}
                                        aria-label={t("next")}
                                    >
                                        <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
                                        <ChevronRight className="hidden size-4 rtl:inline" aria-hidden="true" />
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <Link
                                    href={`/orders/${view.id}` as never}
                                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                                >
                                    <ExternalLink className="size-3" aria-hidden="true" />
                                    {t("openFull")}
                                </Link>
                                <SheetClose
                                    render={(props) => (
                                        <Button {...props} size="sm" variant="ghost">
                                            {t("close")}
                                        </Button>
                                    )}
                                />
                            </div>
                        </SheetHeader>

                        <Tabs defaultValue="items" className="flex-1 overflow-hidden">
                            <TabsList className="border-border border-b px-6">
                                <TabsTrigger value="items">{t("tabs.items")}</TabsTrigger>
                                <TabsTrigger value="addresses">{t("tabs.addresses")}</TabsTrigger>
                                <TabsTrigger value="payment">{t("tabs.payment")}</TabsTrigger>
                                <TabsTrigger value="timeline">{t("tabs.timeline")}</TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-y-auto px-6 py-5 text-sm">
                                <TabsContent value="items" className="flex flex-col gap-3">
                                    {view.lineItems.length === 0 ? (
                                        <p className="text-muted-foreground">{t("noItems")}</p>
                                    ) : (
                                        view.lineItems.map((line) => (
                                            <div
                                                key={line.id}
                                                className="flex items-start justify-between gap-3 border-border/60 border-b pb-2 last:border-0"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-medium">
                                                        {line.name[locale] || `#${line.productId}`}
                                                    </p>
                                                    <p className="font-mono text-muted-foreground text-xs">
                                                        {line.sku || "—"} · ×{formatNumber(line.quantity, locale)}
                                                    </p>
                                                </div>
                                                <p className="font-medium tabular-nums">{formatMoney(line.total, locale)}</p>
                                            </div>
                                        ))
                                    )}
                                </TabsContent>

                                <TabsContent value="addresses" className="grid grid-cols-1 gap-4">
                                    <AddressBlock title={detailT("billing")} address={view.billingAddress} />
                                    <AddressBlock title={detailT("shipping")} address={view.shippingAddress} />
                                </TabsContent>

                                <TabsContent value="payment" className="flex flex-col gap-2">
                                    <KeyRow label={t("paymentMethod")} value={view.paymentMethodTitle[locale] || "—"} />
                                    <KeyRow
                                        label={t("paidAt")}
                                        value={view.paidAt !== null ? formatDateTime(view.paidAt, locale) : "—"}
                                    />
                                    <KeyRow
                                        label={t("completedAt")}
                                        value={view.completedAt !== null ? formatDateTime(view.completedAt, locale) : "—"}
                                    />
                                    {view.shippingInfo?.trackingNumber && (
                                        <KeyRow
                                            label={t("tracking")}
                                            value={
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 font-mono hover:underline"
                                                    onClick={() => {
                                                        void navigator.clipboard?.writeText(
                                                            view.shippingInfo?.trackingNumber ?? "",
                                                        );
                                                        toast.add({
                                                            title: t("trackingCopied"),
                                                            timeout: 2000,
                                                            data: { tone: "success" },
                                                        });
                                                    }}
                                                >
                                                    {view.shippingInfo.trackingNumber}
                                                    <Copy className="size-3" aria-hidden="true" />
                                                </button>
                                            }
                                        />
                                    )}
                                </TabsContent>

                                <TabsContent value="timeline" className="flex flex-col gap-3">
                                    {view.history.length === 0 ? (
                                        <p className="text-muted-foreground">{t("noTimeline")}</p>
                                    ) : (
                                        view.history
                                            .slice()
                                            .reverse()
                                            .map((entry) => (
                                                <div
                                                    key={entry.id}
                                                    className="flex items-start gap-3 border-primary/30 border-l-2 ps-3"
                                                >
                                                    <div className="flex flex-1 flex-col gap-1">
                                                        <span className="inline-flex items-center gap-2 text-xs">
                                                            <OrderStatusBadge status={entry.toStatus} />
                                                            <span className="text-muted-foreground">
                                                                {formatDateTime(entry.occurredAt, locale)}
                                                            </span>
                                                        </span>
                                                        {entry.reason !== null && (
                                                            <p className="text-muted-foreground text-xs">{entry.reason}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </TabsContent>
                            </div>
                        </Tabs>

                        <Separator />
                        <div className="flex items-center justify-between gap-3 border-border border-t px-6 py-4">
                            <span className="text-muted-foreground text-xs">{t("changeStatus")}</span>
                            <StatusFlyout
                                orderId={view.id}
                                current={view.status}
                                successMessage={t("statusUpdated")}
                                errorMessage={t("statusUpdateFailed")}
                                placeholder={t("changeStatus")}
                                labelFor={(status) => tStatus(status)}
                            />
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function KeyRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-sm">{value}</span>
        </div>
    );
}

function AddressBlock({ title, address }: { title: string; address: AdminOrder["billingAddress"] }) {
    if (!address.firstName && !address.lastName && !address.addressLine1) {
        return (
            <section className="flex flex-col gap-1">
                <h4 className="text-muted-foreground text-xs">{title}</h4>
                <p className="text-muted-foreground text-sm">—</p>
            </section>
        );
    }
    return (
        <section className="flex flex-col gap-1">
            <h4 className="text-muted-foreground text-xs">{title}</h4>
            <p className="text-sm">
                {address.firstName} {address.lastName}
            </p>
            {address.company && <p className="text-muted-foreground text-xs">{address.company}</p>}
            <p className="text-sm">{address.addressLine1}</p>
            {address.addressLine2 && <p className="text-sm">{address.addressLine2}</p>}
            <p className="text-muted-foreground text-xs">
                {address.city}
                {address.provinceCode ? ` · ${address.provinceCode}` : ""}
                {address.postcode ? ` · ${address.postcode}` : ""} · {address.country}
            </p>
            {address.phone && <p className="text-muted-foreground text-xs">{address.phone}</p>}
        </section>
    );
}

interface StatusFlyoutProps {
    orderId: number;
    current: OrderStatus;
    successMessage: string;
    errorMessage: string;
    placeholder: string;
    labelFor: (status: OrderStatus) => string;
}

/**
 * Smart status dropdown — only legal next transitions appear in the menu. The mutation is
 * optimistic; the cache flips immediately and rolls back on error. Used inside the quick preview
 * footer and from the detail page header.
 */
export function StatusFlyout({ orderId, current, successMessage, errorMessage, placeholder, labelFor }: StatusFlyoutProps) {
    const mutation = useUpdateOrderStatus();
    const targets = legalNextStatuses(current);
    if (targets.length === 0) {
        return <span className="text-muted-foreground text-xs">{labelFor(current)}</span>;
    }
    return (
        <Select
            value={current}
            onValueChange={(value) => {
                if (typeof value !== "string" || value === current) return;
                mutation.mutate(
                    { id: orderId, to_status: value as OrderStatus },
                    {
                        onSuccess: () => toast.add({ title: successMessage, timeout: 2000, data: { tone: "success" } }),
                        onError: () => toast.add({ title: errorMessage, timeout: 3500, data: { tone: "error" } }),
                    },
                );
            }}
        >
            <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={current}>{labelFor(current)}</SelectItem>
                {targets.map((status) => (
                    <SelectItem key={status} value={status}>
                        {labelFor(status)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
