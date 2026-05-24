import drive from "@adonisjs/drive/services/main";

import type ProductImportError from "#models/product_import_error";
import { errorReportKey } from "#services/product_import/storage";

/**
 * Write the on-disk error-report CSV that the wizard's "اطخ شرازگ دولناد" button serves. Format
 * matches the spec literally — headers in Persian, severity stringified, original value preserved
 * verbatim so the operator can paste it back into the source spreadsheet. Returns the Drive key
 * so the caller can persist it on the import row.
 */
export async function writeErrorReport(importId: number, errors: ProductImportError[]): Promise<string> {
    const key = errorReportKey(importId);
    const header = ["فیدر", "SKU", "نوتس", "یلصا رادقم", "دک", "مایپ", "تدش"];
    const lines: string[] = [header.join(",")];
    for (const row of errors) {
        lines.push(
            [
                row.rowNumber.toString(),
                csvCell(row.sku ?? ""),
                csvCell(row.columnName ?? ""),
                csvCell(row.originalValue ?? ""),
                csvCell(row.code),
                csvCell(row.message),
                row.severity,
            ].join(","),
        );
    }
    /** UTF-8 BOM so Excel opens the file with Persian glyphs rendered correctly. */
    await drive.use("imports").put(key, `﻿${lines.join("\n")}\n`);
    return key;
}

function csvCell(value: string): string {
    const needsQuoting = /[,"\n\r]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuoting ? `"${escaped}"` : escaped;
}
