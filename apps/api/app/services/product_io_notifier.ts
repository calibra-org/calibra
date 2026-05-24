import logger from "@adonisjs/core/services/logger";
import mail from "@adonisjs/mail/services/main";

import { ExportReadyMail, ImportCompletedMail, ImportFailedMail } from "#mails/product_io_mails";
import type ProductExport from "#models/product_export";
import type ProductImport from "#models/product_import";
import User from "#models/user";
import { mintSignedUrl } from "#services/product_export/export_signed_url";
import env from "#start/env";

/**
 * Operator notifications for import + export runners. The runners hand a row + duration; this
 * module decides whether the event warrants an email (long-running OR error terminal) and
 * dispatches via `mail.sendLater`.
 *
 * `MAIL_NOTIFICATIONS_ENABLED=false` short-circuits — useful for CI where no SMTP catcher
 * is reachable. Otherwise every send goes through the configured mailer; SMTP failures are
 * logged at `warn` level and swallowed because a missed notification is never a reason to
 * fail the underlying import/export.
 */

const LONG_RUN_THRESHOLD_MS = 60_000;

export async function notifyImportTerminal(input: {
    row: ProductImport;
    status: "completed" | "completed_with_errors" | "failed" | "cancelled" | "rolled_back";
    durationMs: number;
    failureMessage?: string | null;
}): Promise<void> {
    if (!env.get("MAIL_NOTIFICATIONS_ENABLED")) return;

    /** Notify only on long runs (>60s) OR on terminal failures with row-level errors. */
    const isFailureLike = input.status === "failed" || input.status === "completed_with_errors";
    if (!isFailureLike && input.durationMs < LONG_RUN_THRESHOLD_MS) return;

    const recipient = await resolveRecipient(Number(input.row.userId));
    if (recipient === null) return;

    try {
        if (input.status === "failed") {
            await mail.sendLater(
                new ImportFailedMail({
                    to: recipient,
                    importId: Number(input.row.id),
                    fileName: input.row.originalFilename,
                    message: input.failureMessage ?? input.row.exception ?? "unknown error",
                }),
            );
        } else {
            await mail.sendLater(
                new ImportCompletedMail({
                    to: recipient,
                    importId: Number(input.row.id),
                    fileName: input.row.originalFilename,
                    counts: {
                        created: input.row.createdCount,
                        updated: input.row.updatedCount,
                        skipped: input.row.skippedCount,
                        failed: input.row.failedCount,
                    },
                    durationSec: input.durationMs / 1000,
                }),
            );
        }
    } catch (err) {
        logger.warn({ err, importId: input.row.id }, "notifyImportTerminal: send failed (non-fatal)");
    }
}

export async function notifyExportTerminal(input: {
    row: ProductExport;
    status: "completed" | "failed" | "cancelled";
    durationMs: number;
    failureMessage?: string | null;
}): Promise<void> {
    if (!env.get("MAIL_NOTIFICATIONS_ENABLED")) return;
    if (input.status !== "failed" && input.durationMs < LONG_RUN_THRESHOLD_MS) return;

    const recipient = await resolveRecipient(Number(input.row.userId));
    if (recipient === null) return;

    try {
        if (input.status === "completed") {
            const expiresAt = input.row.downloadExpiresAt;
            if (input.row.filePath === null || expiresAt === null || expiresAt === undefined) return;
            /**
             * Fresh signed token + hash per email — supersedes whatever was minted on
             * `runExport` complete or `show`. The DB-stored hash is the single defense against
             * leaked-dump replay, so writing it before delivering the email is load-bearing.
             */
            const signed = mintSignedUrl({
                userId: Number(input.row.userId),
                exportId: Number(input.row.id),
                expiresAt: expiresAt.toMillis(),
            });
            input.row.downloadTokenHash = signed.hash;
            await input.row.save();
            const baseUrl = env.get("MAILPIT_WEB_URL") ?? "http://localhost";
            const downloadUrl = `${stripTrailingSlash(deriveAppUrl(baseUrl))}/api/v1/admin/products/export/${input.row.id}/download?token=${encodeURIComponent(signed.token)}`;
            await mail.sendLater(
                new ExportReadyMail({
                    to: recipient,
                    exportId: Number(input.row.id),
                    downloadUrl,
                    expiresAt: new Date(expiresAt.toMillis()),
                    fileSizeBytes: Number(input.row.fileSizeBytes ?? 0),
                    rowCount: Number(input.row.processedRows ?? 0),
                }),
            );
            return;
        }
        /** Failure / cancelled paths reuse the importer-failed template content shape verbatim. */
        await mail.sendLater(
            new ImportFailedMail({
                to: recipient,
                importId: Number(input.row.id),
                fileName: input.row.originalFilename ?? `export-${input.row.id}`,
                message: input.failureMessage ?? input.row.exception ?? `export ${input.status}`,
            }),
        );
    } catch (err) {
        logger.warn({ err, exportId: input.row.id }, "notifyExportTerminal: send failed (non-fatal)");
    }
}

async function resolveRecipient(userId: number): Promise<string | null> {
    try {
        const user = await User.find(userId);
        if (user === null) return null;
        const email = (user as unknown as { email?: string }).email;
        return typeof email === "string" && email.length > 0 ? email : null;
    } catch {
        return null;
    }
}

/**
 * The mail's download URL must point at the API origin, not Mailpit's web UI. `APP_URL` would
 * be ideal but we don't have it yet — derive from `HOST` + `PORT` env. Falls back to localhost
 * so the link is always clickable in the operator's browser.
 */
function deriveAppUrl(_mailpitUrlFallback: string): string {
    const host = env.get("HOST") === "0.0.0.0" ? "localhost" : env.get("HOST");
    const port = env.get("PORT");
    return `http://${host}:${port}`;
}

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}
