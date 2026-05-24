"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { PageHeader } from "#/components/PageHeader";
import { DraggableSectionGrid, resetSectionGridStorage, type SectionSpec } from "#/components/sections/draggable-section-grid";
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

import { ActionsCard } from "./actions-card";
import { AddressesCard } from "./addresses-card";
import { CustomerCard } from "./customer-card";
import { CustomerHistoryCard } from "./customer-history-card";
import { DetailKeyboardHelp } from "./detail-keyboard-help";
import { ItemsCard } from "./items-card";
import { LockedBanner } from "./locked-banner";
import { MetaFieldsCard } from "./meta-fields-card";
import { RefundsCard } from "./refunds-card";
import { ShippingCard } from "./shipping-card";
import { SourceCard } from "./source-card";
import { SummaryCard } from "./summary-card";
import { TimelineCard } from "./timeline-card";

interface OrdersDetailProps {
    id: number;
}

const MAIN_GRID_KEY = "orders.detail.sections.main";
const SIDEBAR_GRID_KEY = "orders.detail.sections.sidebar";

/**
 * The detail page, Phase 2. Two columns on desktop (8/4), single column stacked on mobile.
 * Every card lives inside a {@link DraggableSectionGrid} so each admin can shape the page how
 * they like; the order + collapsed state of both columns persists in localStorage. A
 * "Reset to default order" affordance in the page-level "More" menu wipes both grids when an
 * operator wants to start over. The {@link LockedBanner} above the grid handles terminal orders
 * past the auto-lock window.
 */
export function OrdersDetail({ id }: OrdersDetailProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Orders.detail");
    const tCommon = useTranslations("Common");
    const tStatus = useTranslations("OrderStatus");
    const tList = useTranslations("Orders.list");
    const tActions = useTranslations("Orders.detail.headerActions");
    const tGrid = useTranslations("Orders.detail.sections");
    const router = useRouter();
    const resend = useResendConfirmation();
    const markShipped = useMarkShipped();
    const deleteOrder = useDeleteOrder();

    const { data: order, isPending, isError, refetch } = useOrder(id);

    const [helpOpen, setHelpOpen] = useState(false);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, [contenteditable="true"]')) return;
            if (event.metaKey || event.ctrlKey) {
                if (event.key === "p" && order !== undefined) {
                    event.preventDefault();
                    const url = event.shiftKey
                        ? `/orders/${order.id}/packing-slip?print=1`
                        : `/orders/${order.id}/invoice?print=1`;
                    window.open(url, "_blank");
                }
                return;
            }
            if (order === undefined) return;
            switch (event.key) {
                case "a": {
                    event.preventDefault();
                    document.querySelector<HTMLInputElement>('[data-detail-action="add-item"]')?.focus();
                    break;
                }
                case "r": {
                    event.preventDefault();
                    document.querySelector<HTMLButtonElement>('[data-detail-action="open-refund"]')?.click();
                    break;
                }
                case "n": {
                    event.preventDefault();
                    document.querySelector<HTMLTextAreaElement>('[data-detail-action="note-body"]')?.focus();
                    break;
                }
                case "s": {
                    event.preventDefault();
                    document.querySelector<HTMLButtonElement>('[data-detail-action="save-all"]')?.click();
                    break;
                }
                case "?": {
                    event.preventDefault();
                    setHelpOpen(true);
                    break;
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [order]);

    const mainSections = useMemo<SectionSpec[]>(() => {
        if (order === undefined) return [];
        return [
            { id: "summary", title: tGrid("summary"), body: <SummaryCard order={order} locale={locale} /> },
            { id: "items", title: tGrid("items"), body: <ItemsCard order={order} locale={locale} /> },
            { id: "shipping", title: tGrid("shipping"), body: <ShippingCard order={order} locale={locale} /> },
            { id: "refunds", title: tGrid("refunds"), body: <RefundsCard order={order} locale={locale} /> },
            { id: "meta", title: tGrid("meta"), body: <MetaFieldsCard order={order} /> },
            { id: "timeline", title: tGrid("timeline"), body: <TimelineCard order={order} locale={locale} /> },
        ];
    }, [order, locale, tGrid]);

    const sidebarSections = useMemo<SectionSpec[]>(() => {
        if (order === undefined) return [];
        return [
            { id: "actions", title: tGrid("actions"), body: <ActionsCard order={order} /> },
            { id: "customer", title: tGrid("customer"), body: <CustomerCard order={order} locale={locale} /> },
            { id: "addresses", title: tGrid("addresses"), body: <AddressesCard order={order} locale={locale} /> },
            {
                id: "customer-history",
                title: tGrid("customerHistory"),
                body: <CustomerHistoryCard orderId={order.id} customerId={order.customerId} locale={locale} />,
            },
            { id: "source", title: tGrid("source"), body: <SourceCard order={order} locale={locale} /> },
        ];
    }, [order, locale, tGrid]);

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

    const onResetLayout = () => {
        resetSectionGridStorage(MAIN_GRID_KEY);
        resetSectionGridStorage(SIDEBAR_GRID_KEY);
        toast.add({ title: tGrid("resetDone"), timeout: 2500, data: { tone: "success" } });
        window.location.reload();
    };

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={
                    <span className="flex items-center gap-3">
                        {t("titleEditable", { number: order.orderNumber })}
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
                                <DropdownMenuItem onClick={() => setHelpOpen(true)}>{tGrid("shortcuts")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={onResetLayout}>{tGrid("resetOrder")}</DropdownMenuItem>
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

            <LockedBanner order={order} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <DraggableSectionGrid
                    storageKey={MAIN_GRID_KEY}
                    sections={mainSections}
                    labels={{ grabHandle: tGrid("grab"), collapse: tGrid("collapse"), expand: tGrid("expand") }}
                />
                <DraggableSectionGrid
                    storageKey={SIDEBAR_GRID_KEY}
                    sections={sidebarSections}
                    labels={{ grabHandle: tGrid("grab"), collapse: tGrid("collapse"), expand: tGrid("expand") }}
                />
            </div>

            <DetailKeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />
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
