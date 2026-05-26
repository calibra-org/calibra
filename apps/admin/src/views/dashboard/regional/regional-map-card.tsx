"use client";

import type { Locale } from "@calibra/shared/i18n";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import type { DateFilterValue } from "#/components/ui/date-picker";
import { useRegionalProvinceDetail, useRegionalProvinces } from "#/lib/queries/regional";

import { CountryView } from "./country-view";
import { dateFilterToApi } from "./date-filter-to-api";
import { ProvinceView } from "./province-view";
import { RegionalMapHeader } from "./regional-map-header";
import { useTopX } from "./use-top-x";
import type { HeatmapMetric } from "./heatmap-scale";

/**
 * Regional insights — full Card hosting the country↔province state machine. Lives in the admin
 * dashboard between Customer summary and Recent orders. Shares one `LayoutGroup` so the
 * country path morphs into the province silhouette and back when the operator toggles modes.
 */
export function RegionalMapCard() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Dashboard.regional");

    const [metric, setMetric] = useState<HeatmapMetric>("orders");
    const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [topX, setTopX] = useTopX();

    const apiFilters = useMemo(() => dateFilterToApi(dateFilter), [dateFilter]);

    const country = useRegionalProvinces({ ...apiFilters, metric });
    const province = useRegionalProvinceDetail(selectedCode, { ...apiFilters, topProducts: topX });

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 border-b pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">{t("title")}</CardTitle>
                        <CardDescription>{t("subtitle")}</CardDescription>
                    </div>
                    <RegionalMapHeader
                        metric={metric}
                        onMetricChange={setMetric}
                        dateFilter={dateFilter}
                        onDateFilterChange={setDateFilter}
                        topX={topX}
                        onTopXChange={setTopX}
                        locale={locale}
                    />
                </div>
            </CardHeader>
            <CardContent className="pt-5">
                <LayoutGroup id="regional-map">
                    <AnimatePresence mode="wait" initial={false}>
                        {selectedCode === null ? (
                            <CountryView
                                key="country"
                                data={country.data}
                                isPending={country.isPending}
                                isError={country.isError}
                                metric={metric}
                                onSelect={setSelectedCode}
                                locale={locale}
                            />
                        ) : (
                            <ProvinceView
                                key={`province-${selectedCode}`}
                                code={selectedCode}
                                data={province.data}
                                isPending={province.isPending}
                                isError={province.isError}
                                metric={metric}
                                onBack={() => setSelectedCode(null)}
                                locale={locale}
                            />
                        )}
                    </AnimatePresence>
                </LayoutGroup>
            </CardContent>
        </Card>
    );
}
