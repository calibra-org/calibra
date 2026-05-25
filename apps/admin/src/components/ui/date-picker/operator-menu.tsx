"use client";

import { useTranslations } from "next-intl";
import { type ReactNode } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

import { ALLOWED_OPERATORS_BY_GRANULARITY, type DateFilterValue, type Operator } from "./types";

interface OperatorMenuProps {
    value: DateFilterValue;
    onChange: (next: DateFilterValue) => void;
    /** Optional override of the allowed operators (defaults to the granularity's full set). */
    allowed?: Operator[];
    trigger: ReactNode;
}

/**
 * Tiny popover for switching a chip's operator without reopening the whole calendar dialog. The
 * value stays put when possible; switching `within` → single-point operators collapses the range
 * to its start.
 */
export function OperatorMenu({ value, onChange, allowed, trigger }: OperatorMenuProps) {
    const t = useTranslations("DatePicker.operator");
    const options = (allowed ?? ALLOWED_OPERATORS_BY_GRANULARITY[value.granularity]) as Operator[];

    function handlePick(op: Operator) {
        if (op === value.operator) return;
        onChange(applyOperatorSwitch(value, op));
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<div />}>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-32">
                {options.map((op) => (
                    <DropdownMenuItem key={op} onClick={() => handlePick(op)}>
                        {t(op)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Decision table for applying an operator switch to an existing value:
 * - within → before/after: collapse the range to its start date, switch granularity to `day`.
 * - in → before/after: keep the value, swap operator only.
 * - before/after → within (day only): seed the range as `[value, value]` so the user can pick the
 *   end on the next click.
 * - any → in (non-day granularity): swap operator only.
 */
function applyOperatorSwitch(value: DateFilterValue, op: Operator): DateFilterValue {
    if (value.operator === "within" && (op === "before" || op === "after")) {
        return { operator: op, granularity: "day", calendar: value.calendar, value: value.start };
    }
    if (value.operator === "within" && op === "in") {
        return { operator: op, granularity: "year", calendar: value.calendar, value: value.start.slice(0, 4) };
    }
    if (value.operator !== "within" && op === "within") {
        return {
            operator: "within",
            granularity: "day",
            calendar: value.calendar,
            start: value.value,
            end: value.value,
        };
    }
    if (value.operator !== "within" && op === "in") {
        if (value.granularity === "day") {
            return { operator: "in", granularity: "month", calendar: value.calendar, value: value.value.slice(0, 7) };
        }
        return { operator: "in", granularity: value.granularity, calendar: value.calendar, value: value.value };
    }
    if (value.operator !== "within" && (op === "before" || op === "after")) {
        return { operator: op, granularity: value.granularity, calendar: value.calendar, value: value.value };
    }
    return value;
}
