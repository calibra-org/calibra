import vine from "@vinejs/vine";
import type { FieldContext } from "@vinejs/vine/types";

import {
    OPERATORS_BY_COLUMN_TYPE,
    TABLE_VIEW_OPERATORS,
    TABLE_VIEW_SORT_DIRS,
    UNIVERSAL_OPERATORS,
    VOID_OPERATORS,
    type TableViewColumnType,
    type TableViewOperator,
    type TableViewSortDir,
} from "./constants.js";
import type { TableViewColumn, TableViewFilter, TableViewPrimitive, TableViewSort } from "./types.js";

/** Internal: rule names referenced in `field.report` calls and assertion `details.rule` lookups. */
export const FILTER_RULE_NAME = "table_view.filter";
export const SORT_RULE_NAME = "table_view.sort";

interface FilterRuleOptions {
    /** Resolves wire-field name → column declaration. Includes relation fields (dotted keys). */
    fields: Map<string, TableViewColumn>;
}

interface SortRuleOptions {
    /** Whitelist of orderable wire-field names (includes relation fields). */
    fields: Set<string>;
    /** Applied when the wire array is empty / missing. */
    defaultSort: ReadonlyArray<readonly [string, TableViewSortDir]>;
}

/**
 * VineJS custom rule implementing the `filter[]` (and `filterOr[]`) grammar. Accepts a single
 * string, a CSV string, or an array of strings — different HTTP clients serialise multi-value
 * params differently. Each entry parses as `field[:op[:value]]`:
 *
 *  - `field`               — shorthand for `field:eq:value` with value `""` (rejected by tryParseValue)
 *  - `field:value`         — shorthand for `field:eq:value` (or, when `value` is a void op token
 *                            like `isnull`, treated as `field:isnull`)
 *  - `field:op:value`      — explicit
 *  - `field:isnull`        — void-op shorthand (no value slot)
 *
 * Type-aware op validity is enforced here (returns 422 with a precise message), not silently
 * dropped at runtime. The validator mutates the field value into a
 * `Record<field, TableViewFilter>` shape the runtime consumes directly — no second parse pass.
 *
 * The wire grammar mirrors the technance grammar verbatim; see
 * `apps/api/docs/adr/0001-table-views.md` §4 for the contract.
 */
function filterRuleFn(rawValue: unknown, options: FilterRuleOptions, field: FieldContext): void {
    if (isEmpty(rawValue)) {
        field.mutate({}, field);
        return;
    }

    if (typeof rawValue !== "string" && !Array.isArray(rawValue)) {
        field.report("The {{ field }} field must be a string or array of constraints", FILTER_RULE_NAME, field);
        return;
    }

    const entries = normalizeArray(rawValue);
    const result: Record<string, TableViewFilter> = {};

    for (const raw of entries) {
        if (typeof raw !== "string") {
            field.report(`Invalid filter value type`, FILTER_RULE_NAME, field);
            continue;
        }

        const unquoted = stripQuotes(raw);
        const parsed = parseFilterExpression(unquoted);
        if (!parsed.ok) {
            field.report(parsed.error, FILTER_RULE_NAME, field);
            continue;
        }
        const { fieldName, op, valueStr } = parsed;

        const column = options.fields.get(fieldName);
        if (column === undefined) {
            field.report(`Filtering by "${fieldName}" is not allowed`, FILTER_RULE_NAME, field);
            continue;
        }

        if (fieldName in result) {
            field.report(`Field "${fieldName}" already has a filter constraint in this group`, FILTER_RULE_NAME, field);
            continue;
        }

        const allowedOps = allowedOpsForType(column.type);
        if (!allowedOps.includes(op)) {
            field.report(
                `Operator "${op}" is not allowed on field "${fieldName}" (type ${column.type})`,
                FILTER_RULE_NAME,
                field,
            );
            continue;
        }

        const [valueOk, value] = tryParseValue(op, valueStr, (msg) => field.report(msg, FILTER_RULE_NAME, field));
        if (!valueOk) continue;

        result[fieldName] = { field: fieldName, op, value };
    }

    field.mutate(result, field);
}

/** VineJS custom rule implementing the `sort[]` grammar (`field:asc|desc`, case-insensitive). */
function sortRuleFn(rawValue: unknown, options: SortRuleOptions, field: FieldContext): void {
    if (isEmpty(rawValue)) {
        const fallback: Record<string, TableViewSort> = {};
        for (const [f, dir] of options.defaultSort) fallback[f] = { field: f, dir };
        field.mutate(fallback, field);
        return;
    }

    if (typeof rawValue !== "string" && !Array.isArray(rawValue)) {
        field.report("The {{ field }} field must be a string or array of sort constraints", SORT_RULE_NAME, field);
        return;
    }

    const entries = normalizeArray(rawValue);
    const result: Record<string, TableViewSort> = {};

    for (const raw of entries) {
        if (typeof raw !== "string") {
            field.report(`Invalid sort value type`, SORT_RULE_NAME, field);
            continue;
        }

        const [fieldName, dirRaw] = stripQuotes(raw).split(":", 2);
        if (fieldName === undefined || fieldName.length === 0) {
            field.report(`Invalid sort expression "${raw}"`, SORT_RULE_NAME, field);
            continue;
        }

        if (!options.fields.has(fieldName)) {
            field.report(`Ordering by "${fieldName}" is not allowed`, SORT_RULE_NAME, field);
            continue;
        }

        if (fieldName in result) {
            field.report(`Field "${fieldName}" already has a sort constraint`, SORT_RULE_NAME, field);
            continue;
        }

        const dir = normalizeSortDir(dirRaw);
        if (dir === null) {
            field.report(`Invalid sort direction "${dirRaw ?? ""}" in "${raw}"`, SORT_RULE_NAME, field);
            continue;
        }

        result[fieldName] = { field: fieldName, dir };
    }

    field.mutate(result, field);
}

export const filterRule = vine.createRule(filterRuleFn, { implicit: true });
export const sortRule = vine.createRule(sortRuleFn, { implicit: true });

/* ----------------------------- expression parser ----------------------------- */

type ParseResult =
    | { ok: true; fieldName: string; op: TableViewOperator; valueStr: string }
    | { ok: false; error: string };

function parseFilterExpression(raw: string): ParseResult {
    if (raw.length === 0) return { ok: false, error: `Empty filter expression` };

    /** Hand-split into at most 3 parts but preserve trailing colons in the value slot — ISO
     * datetime values (`2026-12-31T23:59:59.999Z`) carry colons too. JS `split(":", 3)` silently
     * drops the tail, which would corrupt `between` bounds. */
    const firstColon = raw.indexOf(":");
    if (firstColon === -1) {
        return { ok: false, error: `Filter expression "${raw}" needs an operator or value` };
    }
    const fieldName = raw.slice(0, firstColon);
    if (fieldName.length === 0) {
        return { ok: false, error: `Invalid filter expression "${raw}"` };
    }
    const rest = raw.slice(firstColon + 1);

    const secondColon = rest.indexOf(":");
    if (secondColon === -1) {
        if (VOID_OPERATORS.includes(rest.toLowerCase() as (typeof VOID_OPERATORS)[number])) {
            return { ok: true, fieldName, op: rest.toLowerCase() as TableViewOperator, valueStr: "" };
        }
        return { ok: true, fieldName, op: "eq", valueStr: rest };
    }

    const opRaw = rest.slice(0, secondColon);
    const opCandidate = opRaw.toLowerCase() as TableViewOperator;
    if (!TABLE_VIEW_OPERATORS.includes(opCandidate)) {
        return { ok: false, error: `Invalid operator "${opRaw}" in "${raw}"` };
    }
    return { ok: true, fieldName, op: opCandidate, valueStr: rest.slice(secondColon + 1) };
}

/* ------------------------------ value coercion ------------------------------ */

type ValueResult = readonly [ok: true, value: TableViewPrimitive | ReadonlyArray<TableViewPrimitive>] | readonly [ok: false];

function tryParseValue(op: TableViewOperator, raw: string, report: (message: string) => void): ValueResult {
    const decoded = safeDecodeURI(raw);

    if (op === "isnull" || op === "notnull") {
        if (decoded.trim().length > 0) {
            report(`Operator "${op}" does not accept a value but got "${decoded}"`);
            return [false];
        }
        return [true, null];
    }

    if (op === "between") {
        const parts = decoded.split(",").map((p) => p.trim());
        if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
            report(`Operator "between" requires exactly two comma-separated values`);
            return [false];
        }
        const a = coerce(parts[0]);
        const b = coerce(parts[1]);
        if (a === null || b === null) {
            report(`Operator "between" does not accept null bounds`);
            return [false];
        }
        return [true, [a, b]];
    }

    if (op === "in" || op === "nin") {
        const parts = decoded
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        if (parts.length === 0) {
            report(`Operator "${op}" requires a non-empty comma-separated list`);
            return [false];
        }
        return [true, parts.map(coerce)];
    }

    const trimmed = decoded.trim();
    if (trimmed.length === 0) {
        report(`Operator "${op}" requires a value`);
        return [false];
    }
    return [true, coerce(trimmed)];
}

/**
 * Coerce a single string token into a primitive. Recognises ints, floats, booleans, and the
 * `null` literal. Anything else stays a string — date parsing happens later in the runtime when
 * the operator and column type are both known (avoids accidentally turning a SKU like `2026-05`
 * into a Date inside the filter rule).
 */
function coerce(raw: string): TableViewPrimitive {
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
    return raw;
}

function allowedOpsForType(type: TableViewColumnType): ReadonlyArray<TableViewOperator> {
    return OPERATORS_BY_COLUMN_TYPE[type] ?? UNIVERSAL_OPERATORS;
}

function normalizeSortDir(raw: string | undefined): TableViewSortDir | null {
    if (raw === undefined) return null;
    const lower = raw.toLowerCase();
    if ((TABLE_VIEW_SORT_DIRS as ReadonlyArray<string>).includes(lower)) return lower as TableViewSortDir;
    return null;
}

function normalizeArray(value: string | Array<unknown>): Array<unknown> {
    if (Array.isArray(value)) return value.map(stripQuotes);
    return [stripQuotes(value)];
}

function stripQuotes<T>(token: T): T {
    if (typeof token === "string" && token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1) as T;
    }
    return token;
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === "";
}

function safeDecodeURI(str: string): string {
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}
