"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    buildDateForPeriod,
    calendarForLocale,
    dateToValueString,
    getDateLib,
    getHalfYear,
    getQuarter,
    valueStringToDate,
} from "./date-lib";
import { formatValueOnly } from "./format";
import { parseDateFilterInput } from "./parse";
import {
    ALLOWED_OPERATORS_BY_GRANULARITY,
    type Calendar,
    type DateFilterValue,
    DEFAULT_OPERATOR_BY_GRANULARITY,
    type Granularity,
    type Operator,
} from "./types";

interface YearRange {
    /** Hard floor; the grids refuse to scroll past it. */
    min?: number;
    /** Hard ceiling. */
    max?: number;
    /** Years rendered on initial mount before lazy expansion. Defaults to 21 (today ± 10). */
    initialSpan?: number;
}

export interface UseDateFilterOptions {
    value: DateFilterValue | null;
    onChange: (next: DateFilterValue | null) => void;
    locale?: "fa" | "en";
    calendar?: Calendar;
    allowedOperators?: Operator[];
    allowedGranularities?: Granularity[];
    defaultGranularity?: Granularity;
    defaultOperator?: Operator;
    yearRange?: YearRange;
    fieldLabel?: string;
    onSubmit?: (v: DateFilterValue) => void;
    onCancel?: () => void;
}

/**
 * Internal staging selection — what the user has "drawn on the dialog" but hasn't committed yet.
 * The hook keeps this separate from the committed `value` so Cancel can revert without firing
 * onChange.
 */
type Selection =
    | { kind: "none" }
    | { kind: "period"; granularity: Granularity; value: string }
    | { kind: "range"; start: string; end: string };

export interface UseDateFilterReturn {
    locale: "fa" | "en";
    calendar: Calendar;
    operator: Operator;
    granularity: Granularity;
    allowedOperators: Operator[];
    allowedGranularities: Granularity[];
    selection: Selection;
    /** True while the operator is `within` and only a single endpoint has been picked. */
    isAwaitingRangeEnd: boolean;
    inputValue: string;
    isInputDirty: boolean;
    parseError: "empty" | "invalid" | "ambiguous" | null;
    hoveredDay: Date | null;

    setOperator: (op: Operator) => void;
    setGranularity: (g: Granularity) => void;
    setInputValue: (s: string) => void;

    handleDayClick: (date: Date) => void;
    handleDayHover: (date: Date | null) => void;
    handleMonthClick: (year: number, monthZero: number) => void;
    handleQuarterClick: (year: number, quarter: 1 | 2 | 3 | 4) => void;
    handleHalfYearClick: (year: number, half: 1 | 2) => void;
    handleYearClick: (year: number) => void;

    commit: () => void;
    cancel: () => void;
    clear: () => void;

    /** Updates with every meaningful state change; consumers feed it to a live region. */
    ariaLiveAnnouncement: string;
}

/**
 * Headless state machine for the date filter dialog. Owns every piece of mutable state (operator,
 * granularity, staged selection, input string, hover preview); the dialog + parts read from it and
 * call back into the mutators.
 *
 * The hook stages selections internally and only writes to `onChange` from {@link commit} or
 * direct grid clicks. Cancel reverts; clear writes `null`.
 */
export function useDateFilter(options: UseDateFilterOptions): UseDateFilterReturn {
    const locale: "fa" | "en" = options.locale ?? "fa";
    const calendar: Calendar = options.calendar ?? calendarForLocale(locale);

    const allowedGranularities = useMemo<Granularity[]>(
        () => options.allowedGranularities ?? ["day", "month", "quarter", "half_year", "year"],
        [options.allowedGranularities],
    );

    const initialGranularity = useMemo<Granularity>(() => {
        if (options.value !== null) return options.value.granularity;
        if (options.defaultGranularity !== undefined) return options.defaultGranularity;
        return allowedGranularities[0] ?? "day";
    }, [allowedGranularities, options.defaultGranularity, options.value]);

    const [granularity, setGranularityState] = useState<Granularity>(initialGranularity);

    const allowedOperators = useMemo<Operator[]>(() => {
        const base = options.allowedOperators ?? ALLOWED_OPERATORS_BY_GRANULARITY[granularity];
        return base.filter((op) => ALLOWED_OPERATORS_BY_GRANULARITY[granularity].includes(op));
    }, [granularity, options.allowedOperators]);

    const initialOperator = useMemo<Operator>(() => {
        if (options.value !== null && allowedOperators.includes(options.value.operator)) {
            return options.value.operator;
        }
        if (options.defaultOperator !== undefined && allowedOperators.includes(options.defaultOperator)) {
            return options.defaultOperator;
        }
        const fallback = DEFAULT_OPERATOR_BY_GRANULARITY[granularity];
        if (allowedOperators.includes(fallback)) return fallback;
        return allowedOperators[0] ?? "before";
    }, [allowedOperators, granularity, options.defaultOperator, options.value]);

    const [operator, setOperatorState] = useState<Operator>(initialOperator);

    const [selection, setSelection] = useState<Selection>(() => selectionFromValue(options.value));

    const [inputValue, setInputValueState] = useState<string>(() =>
        options.value !== null ? formatValueOnly(options.value, { locale }) : "",
    );
    const [isInputDirty, setIsInputDirty] = useState(false);
    const [parseError, setParseError] = useState<"empty" | "invalid" | "ambiguous" | null>(null);
    const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
    const [ariaLiveAnnouncement, setAriaLiveAnnouncement] = useState<string>("");

    const inputDebounceRef = useRef<number | null>(null);

    /**
     * Mirror the staged selection back into the input field whenever the user hasn't typed —
     * grid clicks, operator switches, and granularity tab changes all update `selection`, and
     * the input should reflect what's currently picked rather than sit empty until the user
     * commits. Once they start typing, `isInputDirty` flips true and this effect lets them
     * own the text until cancel/commit clears it again.
     */
    useEffect(() => {
        if (isInputDirty) return;
        if (selection.kind === "none") {
            setInputValueState("");
            return;
        }
        const preview = buildValueFromSelection(selection, operator, calendar);
        if (preview !== null) {
            setInputValueState(formatValueOnly(preview, { locale }));
        }
    }, [calendar, isInputDirty, locale, operator, selection]);

    /**
     * Operator switch. Within → before/after collapses any pending range to its earlier
     * endpoint; before/after → within seeds the range from the current point.
     */
    const setOperator = useCallback((op: Operator) => {
        setOperatorState(op);
        setSelection((current) => {
            if (op === "within" && current.kind === "period" && current.granularity === "day") {
                return current;
            }
            if (op !== "within" && current.kind === "range") {
                return { kind: "period", granularity: "day", value: current.start };
            }
            return current;
        });
        setAriaLiveAnnouncement(`Operator changed to ${op}`);
    }, []);

    /**
     * Granularity switch. Preserves the selected period when there's a meaningful mapping
     * (day → month/year takes the day's year+month etc.); otherwise resets selection.
     */
    const setGranularity = useCallback(
        (next: Granularity) => {
            if (!allowedGranularities.includes(next)) return;
            setGranularityState(next);
            setSelection((current) => mapSelectionToGranularity(current, next, calendar));
            const validOperators = ALLOWED_OPERATORS_BY_GRANULARITY[next];
            setOperatorState((current) => (validOperators.includes(current) ? current : validOperators[0]));
            setAriaLiveAnnouncement(`Switched to ${next} picker`);
        },
        [allowedGranularities, calendar],
    );

    /**
     * Free-text input. We parse on a debounce so every keystroke doesn't recompute, then surface a
     * granularityHint by flipping the active tab when the parse succeeds.
     */
    const setInputValue = useCallback(
        (s: string) => {
            setInputValueState(s);
            setIsInputDirty(true);
            if (inputDebounceRef.current !== null) window.clearTimeout(inputDebounceRef.current);
            inputDebounceRef.current = window.setTimeout(() => {
                if (s.trim() === "") {
                    setParseError(null);
                    return;
                }
                const result = parseDateFilterInput(s, { locale, calendar });
                if ("error" in result) {
                    setParseError(result.error);
                    return;
                }
                setParseError(null);
                if (result.granularityHint !== granularity) {
                    setGranularityState(result.granularityHint);
                    setOperatorState((current) => {
                        const valid = ALLOWED_OPERATORS_BY_GRANULARITY[result.granularityHint];
                        return valid.includes(current) ? current : valid[0];
                    });
                }
                setSelection(selectionFromParsed(result.selection));
            }, 200);
        },
        [calendar, granularity, locale],
    );

    useEffect(
        () => () => {
            if (inputDebounceRef.current !== null) window.clearTimeout(inputDebounceRef.current);
        },
        [],
    );

    const commitValue = useCallback(
        (next: DateFilterValue | null) => {
            options.onChange(next);
            if (next !== null && options.onSubmit !== undefined) options.onSubmit(next);
        },
        [options],
    );

    /**
     * Direct grid clicks (Day / Month / Quarter / Half / Year) commit immediately per the
     * instant-commit rule. The dialog wrapper closes itself in response to the onSubmit fire.
     */
    const commitFromSelection = useCallback(
        (sel: Selection) => {
            if (sel.kind === "none") return;
            const built = buildValueFromSelection(sel, operator, calendar);
            if (built !== null) {
                commitValue(built);
                setSelection(sel);
            }
        },
        [calendar, commitValue, operator],
    );

    /**
     * Compute the next selection from the current closure rather than from `setSelection`'s
     * updater fn — calling `commitFromSelection` inside an updater violates React's rule that
     * state updaters be side-effect-free (it cascades into a parent `setState` via the
     * `onChange` prop, which Strict Mode reports as "update during render"). Reading
     * `selection` from the closure means the callback re-creates on selection change, which is
     * cheap and keeps the side-effect outside the updater.
     */
    const handleDayClick = useCallback(
        (date: Date) => {
            const lib = getDateLib(calendar);
            const value = dateToValueString(date, "day", lib);
            if (operator !== "within") {
                commitFromSelection({ kind: "period", granularity: "day", value });
                return;
            }
            if (selection.kind === "range") {
                commitFromSelection(orderRange({ kind: "range", start: selection.start, end: value }));
                return;
            }
            if (selection.kind === "period" && selection.granularity === "day") {
                commitFromSelection(orderRange({ kind: "range", start: selection.value, end: value }));
                return;
            }
            setSelection({ kind: "period", granularity: "day", value });
        },
        [calendar, commitFromSelection, operator, selection],
    );

    const handleDayHover = useCallback((date: Date | null) => setHoveredDay(date), []);

    const handleMonthClick = useCallback(
        (year: number, monthZero: number) => {
            commitFromSelection({
                kind: "period",
                granularity: "month",
                value: `${year}-${String(monthZero + 1).padStart(2, "0")}`,
            });
        },
        [commitFromSelection],
    );

    const handleQuarterClick = useCallback(
        (year: number, quarter: 1 | 2 | 3 | 4) => {
            commitFromSelection({ kind: "period", granularity: "quarter", value: `${year}-Q${quarter}` });
        },
        [commitFromSelection],
    );

    const handleHalfYearClick = useCallback(
        (year: number, half: 1 | 2) => {
            commitFromSelection({ kind: "period", granularity: "half_year", value: `${year}-H${half}` });
        },
        [commitFromSelection],
    );

    const handleYearClick = useCallback(
        (year: number) => {
            commitFromSelection({ kind: "period", granularity: "year", value: String(year) });
        },
        [commitFromSelection],
    );

    /**
     * Apply-button commit — the safety valve for typed input. Reads the current selection,
     * builds a value, fires onChange. Click-driven flows go through {@link commitFromSelection}
     * before they ever reach here.
     */
    const commit = useCallback(() => {
        if (selection.kind === "none") return;
        const built = buildValueFromSelection(selection, operator, calendar);
        if (built === null) return;
        commitValue(built);
        setIsInputDirty(false);
    }, [calendar, commitValue, operator, selection]);

    const cancel = useCallback(() => {
        setSelection(selectionFromValue(options.value));
        setInputValueState(options.value !== null ? formatValueOnly(options.value, { locale }) : "");
        setIsInputDirty(false);
        setParseError(null);
        if (options.onCancel !== undefined) options.onCancel();
    }, [locale, options]);

    const clear = useCallback(() => {
        setSelection({ kind: "none" });
        setInputValueState("");
        setIsInputDirty(false);
        setParseError(null);
        commitValue(null);
    }, [commitValue]);

    const isAwaitingRangeEnd = operator === "within" && selection.kind === "period" && selection.granularity === "day";

    return {
        locale,
        calendar,
        operator,
        granularity,
        allowedOperators,
        allowedGranularities,
        selection,
        isAwaitingRangeEnd,
        inputValue,
        isInputDirty,
        parseError,
        hoveredDay,
        setOperator,
        setGranularity,
        setInputValue,
        handleDayClick,
        handleDayHover,
        handleMonthClick,
        handleQuarterClick,
        handleHalfYearClick,
        handleYearClick,
        commit,
        cancel,
        clear,
        ariaLiveAnnouncement,
    };
}

function selectionFromValue(value: DateFilterValue | null): Selection {
    if (value === null) return { kind: "none" };
    if (value.operator === "within") {
        return { kind: "range", start: value.start, end: value.end };
    }
    return { kind: "period", granularity: value.granularity, value: value.value };
}

function selectionFromParsed(
    parsed: { kind: "period"; granularity: Granularity; value: string } | { kind: "range"; start: string; end: string },
): Selection {
    return parsed;
}

function buildValueFromSelection(selection: Selection, operator: Operator, calendar: Calendar): DateFilterValue | null {
    if (selection.kind === "none") return null;
    if (selection.kind === "range") {
        return {
            operator: "within",
            granularity: "day",
            calendar,
            start: selection.start,
            end: selection.end,
        };
    }
    if (selection.granularity === "day") {
        const op = operator === "within" ? "before" : operator;
        if (op === "in") return null;
        return { operator: op, granularity: "day", calendar, value: selection.value };
    }
    const op = operator === "within" ? "in" : operator;
    if (op === "in") {
        return { operator: "in", granularity: selection.granularity, calendar, value: selection.value };
    }
    return { operator: op, granularity: selection.granularity, calendar, value: selection.value };
}

/**
 * Decision table for mapping a staged selection into a different granularity. Goal is to preserve
 * intent — switching day→month keeps the month containing the selected day, year→day takes Jan 1
 * of that year, and so on. Returns `{ kind: "none" }` when no meaningful mapping exists.
 */
function mapSelectionToGranularity(current: Selection, next: Granularity, calendar: Calendar): Selection {
    if (current.kind === "none") return current;
    if (current.kind === "range") {
        if (next === "day") return current;
        const lib = getDateLib(calendar);
        const start = valueStringToDate(current.start, "day", lib);
        if (start === null) return { kind: "none" };
        return { kind: "period", granularity: next, value: dateToValueString(start, next, lib) };
    }
    const lib = getDateLib(calendar);
    const anchor = valueStringToDate(current.value, current.granularity, lib);
    if (anchor === null) return { kind: "none" };

    if (next === "day") {
        const day = buildDateForPeriod("day", lib.getYear(anchor), lib.getMonth(anchor), 1, lib);
        return { kind: "period", granularity: "day", value: dateToValueString(day, "day", lib) };
    }
    if (next === "month") {
        return { kind: "period", granularity: "month", value: dateToValueString(anchor, "month", lib) };
    }
    if (next === "quarter") {
        const year = lib.getYear(anchor);
        return { kind: "period", granularity: "quarter", value: `${year}-Q${getQuarter(anchor, lib)}` };
    }
    if (next === "half_year") {
        const year = lib.getYear(anchor);
        return { kind: "period", granularity: "half_year", value: `${year}-H${getHalfYear(anchor, lib)}` };
    }
    return { kind: "period", granularity: "year", value: String(lib.getYear(anchor)) };
}

function orderRange(sel: { kind: "range"; start: string; end: string }): Selection {
    if (sel.start <= sel.end) return sel;
    return { kind: "range", start: sel.end, end: sel.start };
}
