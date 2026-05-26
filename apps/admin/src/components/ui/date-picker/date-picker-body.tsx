"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "#/lib/utils";

import { DayGrid } from "./parts/day-grid";
import { DialogActions } from "./parts/dialog-actions";
import { GranularityTabs } from "./parts/granularity-tabs";
import { HalfYearGrid } from "./parts/half-year-grid";
import { MonthGrid } from "./parts/month-grid";
import { OperatorChips } from "./parts/operator-chips";
import { QuarterGrid } from "./parts/quarter-grid";
import { ValueInput } from "./parts/value-input";
import { YearList } from "./parts/year-list";
import type { UseDateFilterReturn } from "./use-date-filter";

interface DatePickerBodyProps {
    state: UseDateFilterReturn;
    fieldLabel?: string;
}

/**
 * The dialog body — the part that's identical between filter-mode (modal Dialog) and form-mode
 * (Popover). Reads everything from the headless hook and renders the active grid based on the
 * staged granularity.
 */
export function DatePickerBody({ state, fieldLabel }: DatePickerBodyProps) {
    const t = useTranslations("DatePicker");
    const [numberOfMonths, containerRef] = useResponsiveMonthCount();

    return (
        <div ref={containerRef} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground text-sm">{fieldLabel ?? t("defaultFieldLabel")}</span>
                <OperatorChips
                    operator={state.operator}
                    allowed={state.allowedOperators}
                    onChange={state.setOperator}
                    labelFor={(op) => t(`operator.${op}`)}
                    groupLabel={t("operatorGroupLabel")}
                />
            </div>

            <ValueInput
                value={state.inputValue}
                onChange={state.setInputValue}
                onSubmit={state.commit}
                onCancel={state.cancel}
                placeholder={t(`placeholder.${state.calendar}`)}
                invalid={state.parseError !== null && state.parseError !== "empty"}
                errorLabel={state.parseError !== null ? t(`error.${state.parseError}`) : null}
            />

            <GranularityTabs
                granularity={state.granularity}
                allowed={state.allowedGranularities}
                onChange={state.setGranularity}
                labelFor={(g) => t(`granularity.${g}`)}
                groupLabel={t("granularityGroupLabel")}
            />

            <ActiveGrid state={state} numberOfMonths={numberOfMonths} />

            <div className="sr-only" role="status" aria-live="polite">
                {state.ariaLiveAnnouncement}
            </div>

            <DialogActions
                onCancel={state.cancel}
                onApply={state.commit}
                canApply={state.canApply}
                labels={{ cancel: t("cancel"), apply: t("apply") }}
            />
        </div>
    );
}

function ActiveGrid({ state, numberOfMonths }: { state: UseDateFilterReturn; numberOfMonths: number }) {
    if (state.granularity === "day") {
        return (
            <div className={cn("min-h-72")}>
                <DayGrid
                    calendar={state.calendar}
                    locale={state.locale}
                    operator={state.operator}
                    selection={state.selection}
                    hoveredDay={state.hoveredDay}
                    onDayClick={state.handleDayClick}
                    onDayHover={state.handleDayHover}
                    numberOfMonths={numberOfMonths}
                />
            </div>
        );
    }
    if (state.granularity === "month") {
        return (
            <MonthGrid
                calendar={state.calendar}
                locale={state.locale}
                selected={monthSelection(state.selection)}
                onPick={state.handleMonthClick}
                ariaLabel="Month grid"
            />
        );
    }
    if (state.granularity === "quarter") {
        return (
            <QuarterGrid
                calendar={state.calendar}
                locale={state.locale}
                selected={quarterSelection(state.selection)}
                onPick={state.handleQuarterClick}
                ariaLabel="Quarter grid"
            />
        );
    }
    if (state.granularity === "half_year") {
        return (
            <HalfYearGrid
                calendar={state.calendar}
                locale={state.locale}
                selected={halfYearSelection(state.selection)}
                onPick={state.handleHalfYearClick}
                ariaLabel="Half-year grid"
            />
        );
    }
    return (
        <YearList
            calendar={state.calendar}
            locale={state.locale}
            selectedYear={yearSelection(state.selection)}
            onPick={state.handleYearClick}
            ariaLabel="Year list"
        />
    );
}

function monthSelection(sel: UseDateFilterReturn["selection"]): { year: number; monthZero: number } | null {
    if (sel.kind !== "period" || sel.granularity !== "month") return null;
    const m = /^(\d{3,4})-(\d{2})$/.exec(sel.value);
    if (m === null) return null;
    return { year: Number(m[1]), monthZero: Number(m[2]) - 1 };
}

function quarterSelection(sel: UseDateFilterReturn["selection"]): { year: number; quarter: 1 | 2 | 3 | 4 } | null {
    if (sel.kind !== "period" || sel.granularity !== "quarter") return null;
    const m = /^(\d{3,4})-Q([1-4])$/i.exec(sel.value);
    if (m === null) return null;
    return { year: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 };
}

function halfYearSelection(sel: UseDateFilterReturn["selection"]): { year: number; half: 1 | 2 } | null {
    if (sel.kind !== "period" || sel.granularity !== "half_year") return null;
    const m = /^(\d{3,4})-H([12])$/i.exec(sel.value);
    if (m === null) return null;
    return { year: Number(m[1]), half: Number(m[2]) as 1 | 2 };
}

function yearSelection(sel: UseDateFilterReturn["selection"]): number | null {
    if (sel.kind !== "period" || sel.granularity !== "year") return null;
    return Number(sel.value);
}

/**
 * Returns 1 or 2 based on the container's actual width via `ResizeObserver` — preferable to a
 * viewport media query because the picker mounts inside dialogs/popovers/sheets that may be
 * narrower than the window itself (e.g. a 576 px dialog on a 1200 px monitor still can't fit
 * two month grids comfortably). Threshold is 560 px: two full 7-column day grids + gap +
 * padding fit around there. Falls back to 2 during SSR so the desktop-first first paint
 * matches the most common case.
 */
function useResponsiveMonthCount(): [number, React.RefCallback<HTMLDivElement>] {
    const [count, setCount] = useState(2);
    const [element, setElement] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (element === null || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry === undefined) return;
            setCount(entry.contentRect.width >= 560 ? 2 : 1);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return [count, setElement];
}
