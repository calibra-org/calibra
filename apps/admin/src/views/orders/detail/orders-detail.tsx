"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
import { toast } from "#/components/ui/toast";
import { formatDateTime } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useDeleteOrder, useMarkShipped, useOrder, useResendConfirmation } from "#/lib/queries/orders";

import { StatusFlyout } from "../list/quick-preview-drawer";

import { AddressesCard } from "./addresses-card";
import { CustomerCard } from "./customer-card";
import { ItemsCard } from "./items-card";
import { RefundsCard } from "./refunds-card";
import { ShippingCard } from "./shipping-card";
import { SummaryCard } from "./summary-card";
import { TimelineCard } from "./timeline-card";

interface OrdersDetailProps {
    id: number;
}

/**
 * The detail page. Two-column on desktop (8/4), single-column stacked on mobile. Every card is
 * its own component so the file stays scan-readable; mutations live inside their respective
 * cards (refunds, shipping, status). The header dropdown collects the rare actions (mark shipped,
 * resend, delete) that don't deserve their own card.
 */
export function OrdersDetail({ id }: OrdersDetailProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Orders.detail");
    const tCommon = useTranslations("Common");
    const tStatus = useTranslations("OrderStatus");
    const tList = useTranslations("Orders.list");
    const tActions = useTranslations("Orders.detail.headerActions");
    const router = useRouter();
    const resend = useResendConfirmation();
    const markShipped = useMarkShipped();
    const deleteOrder = useDeleteOrder();

    const { data: order, isPending, isError, refetch } = useOrder(id);

    if (isPending) return <OrderDetailSkeleton />;
    if (isError || order === undefined) {
        return (
            <section className="flex flex-col gap-3 p-6 text-center">
                <p className="text-muted-foreground text-sm">{t("notFound")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="self-center">
                    {tCommon("retry")}
                </Button>
            </section>
        );
    }

    const onResend = async () => {
        try {
            await resend.mutateAsync({ id: order.id });
            toast.add({ title: tList("confirmationResent"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: tList("confirmationResendFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const onMarkShipped = async () => {
        try {
            await markShipped.mutateAsync({ id: order.id });
            toast.add({ title: tList("markedShipped"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: tList("markShippedFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const onDelete = async () => {
        try {
            await deleteOrder.mutateAsync({ id: order.id });
            toast.add({ title: tList("trashed"), timeout: 2500, data: { tone: "success" } });
            router.push("/orders" as never);
        } catch {
            toast.add({ title: tList("trashFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

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
                    <div className="flex items-center gap-2">
                        <StatusFlyout
                            orderId={order.id}
                            current={order.status}
                            placeholder={t("changeStatus")}
                            successMessage={t("statusUpdated")}
                            errorMessage={t("statusUpdateFailed")}
                            labelFor={(status) => tStatus(status)}
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button {...props} variant="outline" size="sm">
                                        {tActions("more")}
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="end">
                                {order.status === "processing" && (
                                    <DropdownMenuItem onClick={onMarkShipped}>{tActions("markShipped")}</DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={onResend}>{tActions("resend")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`/orders/${order.id}/invoice?print=1`, "_blank")}>
                                    {tActions("printInvoice")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => window.open(`/orders/${order.id}/packing-slip?print=1`, "_blank")}
                                >
                                    {tActions("printPacking")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                                >
                                    {tActions("delete")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    <ItemsCard order={order} locale={locale} />
                    <ShippingCard order={order} locale={locale} />
                    <RefundsCard order={order} locale={locale} />
                    <TimelineCard order={order} locale={locale} />
                </div>
                <aside className="flex flex-col gap-4">
                    <CustomerCard order={order} locale={locale} />
                    <AddressesCard order={order} locale={locale} />
                    <SummaryCard order={order} locale={locale} />
                </aside>
            </div>
        </section>
    );
}

function OrderDetailSkeleton() {
    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-44" />
                    <Skeleton className="h-8 w-28" />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        </section>
    );
}
