import { BaseMail } from "@adonisjs/mail";

/**
 * Operator notifications for long-running or failing CSV import/export jobs. Three classes —
 * one per terminal event the runners care about. Persian subject + body, since the operator UI
 * (admin panel) defaults to fa-IR. Bodies are inline HTML to avoid wiring up Edge views for a
 * narrow notification surface; if we ever ship many transactional emails, lift them into
 * `resources/views/emails/*.edge`.
 *
 * The runner builds an instance and hands it to `mail.sendLater(...)` — the queue (in-memory
 * for now; persistent once `@adonisjs/queue` lands in step 6) takes over so the runner's hot
 * path doesn't block on SMTP latency.
 */

interface ImportCompletedPayload {
    to: string;
    importId: number;
    fileName: string;
    counts: { created: number; updated: number; skipped: number; failed: number };
    durationSec: number;
}

export class ImportCompletedMail extends BaseMail {
    subject = "وارد کردن محصولات با موفقیت انجام شد";

    constructor(private readonly payload: ImportCompletedPayload) {
        super();
    }

    prepare() {
        const { to, importId, fileName, counts, durationSec } = this.payload;
        this.message.to(to).html(`
            <p>وارد کردن محصولات از فایل <strong>${escapeHtml(fileName)}</strong> به پایان رسید.</p>
            <ul>
                <li>ایجاد شده: ${counts.created}</li>
                <li>به‌روزرسانی شده: ${counts.updated}</li>
                <li>رد شده: ${counts.skipped}</li>
                <li>ناموفق: ${counts.failed}</li>
                <li>مدت زمان: ${Math.round(durationSec)} ثانیه</li>
            </ul>
            <p>شناسهٔ کار: <code>#${importId}</code></p>
        `);
    }
}

interface ImportFailedPayload {
    to: string;
    importId: number;
    fileName: string;
    message: string;
}

export class ImportFailedMail extends BaseMail {
    subject = "وارد کردن با خطا متوقف شد";

    constructor(private readonly payload: ImportFailedPayload) {
        super();
    }

    prepare() {
        const { to, importId, fileName, message } = this.payload;
        this.message.to(to).html(`
            <p>وارد کردن محصولات از فایل <strong>${escapeHtml(fileName)}</strong> با خطا متوقف شد.</p>
            <pre style="background:#f6f8fa;padding:12px;border-radius:6px;direction:ltr;text-align:left">${escapeHtml(message)}</pre>
            <p>شناسهٔ کار: <code>#${importId}</code></p>
        `);
    }
}

interface ExportReadyPayload {
    to: string;
    exportId: number;
    downloadUrl: string;
    expiresAt: Date;
    fileSizeBytes: number;
    rowCount: number;
}

export class ExportReadyMail extends BaseMail {
    subject = "خروجی محصولات شما آماده شد";

    constructor(private readonly payload: ExportReadyPayload) {
        super();
    }

    prepare() {
        const { to, exportId, downloadUrl, expiresAt, fileSizeBytes, rowCount } = this.payload;
        const sizeMb = (fileSizeBytes / 1024 / 1024).toFixed(2);
        this.message.to(to).html(`
            <p>خروجی محصولات شما آماده دانلود است.</p>
            <ul>
                <li>تعداد رکورد: ${rowCount}</li>
                <li>اندازهٔ فایل: ${sizeMb} مگابایت</li>
                <li>اعتبار لینک تا: ${expiresAt.toISOString()}</li>
            </ul>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">دانلود فایل</a></p>
            <p>شناسهٔ کار: <code>#${exportId}</code></p>
        `);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
