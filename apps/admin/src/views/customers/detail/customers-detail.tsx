"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { DraggableSectionGrid, type SectionSpec } from "#/components/sections/draggable-section-grid";
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
    const { data: customer } = useCustomer(initialCustomerId);
    const reset = useSendPasswordReset(initialCustomerId);

    if (!customer) {
        return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
    }

    const mainSections: SectionSpec[] = [
        {
            id: "summary",
            title: detailT("profile"),
            body: <SummaryCard customer={customer} locale={locale} t={(key) => detailT(key as never)} />,
        },
        {
            id: "lifetime-stats",
            title: detailT("totalOrders"),
            body: <LifetimeStatsCard customer={customer} locale={locale} t={(key) => detailT(key as never)} />,
        },
        {
            id: "timeline",
            title: detailT("timeline"),
            body: <TimelineCard customerId={customer.id} locale={locale} t={(key) => detailT(key as never)} />,
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
                    t={(key) => {
                        if (key.startsWith("detail.") || key.startsWith("rowActions.") || key === "cancel") {
                            return key.startsWith("detail.")
                                ? detailT(key.slice("detail.".length) as never)
                                : key === "cancel"
                                  ? detailT("cancel")
                                  : t(key);
                        }
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
                <DraggableSectionGrid
                    storageKey={MAIN_GRID_KEY}
                    sections={mainSections}
                    labels={{
                        grabHandle: "Drag to reorder",
                        collapse: "Collapse",
                        expand: "Expand",
                    }}
                />
                <DraggableSectionGrid
                    storageKey={SIDEBAR_GRID_KEY}
                    sections={sidebarSections}
                    labels={{
                        grabHandle: "Drag to reorder",
                        collapse: "Collapse",
                        expand: "Expand",
                    }}
                />
            </div>
        </section>
    );
}
