import { type ReactTable, useTable } from "@tanstack/react-table";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { dataGridFeatures, type DataGridFeatures } from "./features";
import type { ColumnDef } from "./types";

/**
 * react-table v9 registers no features by default — an API is absent because its feature was not
 * registered, not because the library removed it. The compiler cannot see that: the grid
 * type-checks and then throws on first render. This suite renders a real `useTable` through
 * `react-dom/server` and asserts every table API the data grid calls is reachable from
 * {@link dataGridFeatures}.
 *
 * Server rendering rather than a DOM testing library keeps this to dependencies the app already
 * has, and one render pass is enough — feature registration is resolved when the table is
 * constructed, not on interaction. `createElement` avoids JSX so the file stays a plain `.ts`
 * test, matching the rest of the suite and needing no JSX transform in the vitest config.
 */

interface TestRow {
    id: string;
    name: string;
}

const data: TestRow[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
];

const columns: ColumnDef<TestRow>[] = [{ accessorKey: "name", id: "name", header: "Name" }];

/** Renders once and hands the constructed table back for assertions. */
function withTable(assert: (table: ReactTable<DataGridFeatures, TestRow>) => void): void {
    function Probe() {
        const table = useTable({
            features: dataGridFeatures,
            data,
            columns,
            getRowId: (row: TestRow) => row.id,
            manualPagination: true,
            manualSorting: true,
            manualFiltering: true,
            enableRowSelection: true,
            enableColumnResizing: true,
        });
        assert(table);
        return null;
    }
    renderToStaticMarkup(createElement(Probe));
}

describe("dataGridFeatures", () => {
    it("resolves the core row model without an explicit factory", () => {
        withTable((table) => {
            expect(table.getRowModel().rows).toHaveLength(2);
        });
    });

    it("exposes the row-selection APIs the select column calls", () => {
        withTable((table) => {
            expect(table.getIsAllPageRowsSelected()).toBe(false);
            expect(table.getIsSomePageRowsSelected()).toBe(false);
            expect(typeof table.toggleAllPageRowsSelected).toBe("function");
        });
    });

    it("exposes column visibility, ordering and sizing", () => {
        withTable((table) => {
            expect(table.getAllLeafColumns()).toHaveLength(1);
            expect(typeof table.setColumnOrder).toBe("function");
            expect(table.getTotalSize()).toBeGreaterThan(0);
        });
    });

    /**
     * v8's single `columnSizing` split into sizing plus resizing, and `getState().columnSizingInfo`
     * became `state.columnResizing`. The grid reads `isResizingColumn` off it on every header render.
     */
    it("exposes the resizing state under its v9 name", () => {
        withTable((table) => {
            expect(table.state.columnResizing).toHaveProperty("isResizingColumn");
        });
    });

    it("exposes row expansion, whose row model moved into a feature slot", () => {
        withTable((table) => {
            expect(typeof table.getExpandedRowModel).toBe("function");
            expect(typeof table.setExpanded).toBe("function");
        });
    });

    /** Sorting, filtering and pagination are server-driven here, but their APIs still come from features. */
    it("exposes the server-driven sorting, filtering and pagination surfaces", () => {
        withTable((table) => {
            expect(typeof table.setSorting).toBe("function");
            expect(typeof table.setColumnFilters).toBe("function");
            expect(typeof table.setPagination).toBe("function");
        });
    });

    /** v9 moved instance methods onto prototypes, so they must be called off the instance. */
    it("keeps row instance methods callable off the instance", () => {
        withTable((table) => {
            const [first] = table.getRowModel().rows;
            expect(first?.getValue("name")).toBe("Alpha");
            expect(first?.getIsSelected()).toBe(false);
        });
    });
});
