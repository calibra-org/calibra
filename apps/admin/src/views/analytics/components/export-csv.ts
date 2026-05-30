/**
 * Trigger a CSV download for a report table through the same-origin admin proxy. The api streams a
 * `text/csv` attachment for `format=csv`; the proxy passes the content-disposition header through,
 * so a plain anchor click downloads the full windowed result.
 */
export function downloadReportCsv(report: string, query: Record<string, string | number | undefined>): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
    }
    params.set("format", "csv");
    const anchor = document.createElement("a");
    anchor.href = `/api/admin/reports/${report}?${params.toString()}`;
    anchor.download = `${report}-report.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
