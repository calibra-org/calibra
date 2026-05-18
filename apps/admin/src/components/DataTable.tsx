import type { ReactNode } from "react";

interface Column<T> {
    /** Stable id for the column — used as the React key on header + body cells. */
    id: string;
    /** Header content. Typically a translated string. */
    header: ReactNode;
    /** Cell renderer. Receives the row plus its zero-based index. */
    cell: (row: T, index: number) => ReactNode;
    /** Tailwind classes applied to both header and body cells (e.g. `"w-32"`, `"text-end"`). */
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    /** Stable row key — falls back to the array index if `getRowKey` isn't supplied. */
    getRowKey?: (row: T, index: number) => string | number;
    emptyState: ReactNode;
}

/**
 * Lean generic table. Renders a single `<table>`; pagination, sorting, and selection are caller
 * concerns — pass a controlled `rows` array shaped for the current page. Add a thin wrapper for
 * row hover / click handling rather than baking it in here.
 */
export function DataTable<T>({ columns, rows, getRowKey, emptyState }: DataTableProps<T>) {
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border border-dashed bg-card p-12 text-center text-muted-foreground text-sm">
                {emptyState}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-border border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                        {columns.map((column) => (
                            <th key={column.id} className={`px-4 py-3 text-start font-medium ${column.className ?? ""}`}>
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            key={getRowKey?.(row, index) ?? index}
                            className="border-border border-b transition last:border-b-0 hover:bg-muted/40"
                        >
                            {columns.map((column) => (
                                <td key={column.id} className={`px-4 py-3 ${column.className ?? ""}`}>
                                    {column.cell(row, index)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
