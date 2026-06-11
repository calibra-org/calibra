"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { DraggableSectionGrid, type SectionSpec } from "#/components/sections/draggable-section-grid";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useCustomer, useSendPasswordReset } from "#/lib/queries/customers";

import { ActionsCard } from "./actions-card";
import { DetailHeader } from "./header";
import { LifetimeStatsCard } from "./lifetime-stats-card";
import { MarketingPrefsCard } from "./marketing-prefs-card";
import { NotesCard } from "./notes-card";
import { SummaryCard } from "./summary-card";
import { TagsCard } from "./tags-card";
import { TimelineCard } from "./timeline-card";

interface CustomersDetailProps {
    initialCustomerId: number;
    locale: Locale;
}

const MAIN_GRID_KEY = "customers.detail.sections.main";
const SIDEBAR_GRID_KEY = "customers.detail.sections.sidebar";

export function CustomersDetailClient({ initialCustomerId, locale }: CustomersDetailProps) {
    const t = useTranslations("Customers");
    const detailT = useTranslations("Customers.detail");
    const statusT = useTranslations("Customers.statusBadge");
    const { data: customer, isPending, isError, refetch } = useCustomer(initialCustomerId);
    const reset = useSendPasswordReset(initialCustomerId);

    if (isPending) {
        return <CustomerDetailSkeleton />;
    }

    if (isError || customer === null) {
        return (
            <section className="flex flex-col gap-3 p-6 text-center">
                <p className="text-muted-foreground text-sm">{isError ? detailT("loadError") : detailT("notFound")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="self-center">
                    {detailT("retry")}
                </Button>
            </section>
        );
    }

    const dragLabels = {
        grabHandle: detailT("section.grabHandle"),
        collapse: detailT("section.collapse"),
        expand: detailT("section.expand"),
    };

    const mainSections: SectionSpec[] = [
        {
            id: "summary",
            title: detailT("profile"),
            body: <SummaryCard customer={customer} locale={locale} t={(key) => detailT(key as never)} />,
        },
        {
            id: "lifetime-stats",
            title: detailT("lifetimeStats"),
            body: <LifetimeStatsCard customer={customer} locale={locale} t={(key) => detailT(key as never)} />,
        },
        {
            id: "timeline",
            title: detailT("timelineSection.title"),
            body: <TimelineCard customerId={customer.id} locale={locale} />,
        },
        {
            id: "notes",
            title: detailT("notes"),
            body: <NotesCard customerId={customer.id} locale={locale} t={(key) => detailT(key as never)} />,
        },
    ];

    const sidebarSections: SectionSpec[] = [
        {
            id: "actions",
            title: detailT("actions"),
            body: (
                <ActionsCard
                    customer={customer}
                    locale={locale}
                    t={(key) => {
                        if (key.startsWith("detail.")) return detailT(key.slice("detail.".length) as never);
                        if (key === "cancel") return detailT("cancel");
                        return t(key);
                    }}
                />
            ),
        },
        {
            id: "tags",
            title: detailT("tags"),
            body: <TagsCard customer={customer} t={(key) => detailT(key as never)} />,
        },
        {
            id: "marketing",
            title: detailT("marketing"),
            body: <MarketingPrefsCard customerId={customer.id} locale={locale} t={(key) => detailT(key as never)} />,
        },
    ];

    return (
        <section className="flex flex-col gap-6">
            <DetailHeader
                customer={customer}
                locale={locale}
                t={(key, values) => t(key, values)}
                statusT={(key) => statusT(key as never)}
                onSendReset={customer.hasAccount ? () => reset.mutate() : undefined}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                <DraggableSectionGrid storageKey={MAIN_GRID_KEY} sections={mainSections} labels={dragLabels} />
                <DraggableSectionGrid storageKey={SIDEBAR_GRID_KEY} sections={sidebarSections} labels={dragLabels} />
            </div>
        </section>
    );
}

/**
 * First-paint placeholder for the customer detail screen while {@link useCustomer} resolves.
 * Mirrors the real layout — header row plus the 1fr/320px two-column section grid — so the
 * page doesn't reflow when the data lands.
 */
function CustomerDetailSkeleton() {
    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Skeleton className="size-12 rounded-full" />
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-24" />
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    {[0, 1, 2].map((key) => (
                        <div key={key} className="flex flex-col gap-3 rounded-lg border p-4">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-4">
                    {[0, 1].map((key) => (
                        <div key={key} className="flex flex-col gap-3 rounded-lg border p-4">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
