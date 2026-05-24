import { BaseMail } from "@adonisjs/mail";

/**
 * Operator notifications for long-running or failing CSV import/export jobs. Three classes —
 * one per terminal event the runners care about. All three render through {@link layout}, a
 * single email-client-safe HTML shell (table-based, fully inlined styles, RTL-first) so the
 * three templates stay visually consistent.
 *
 * Inline HTML on purpose: this is a narrow notification surface and Edge templates would add
 * a build step (`@adonisjs/view`) for negligible gain. If the surface grows beyond five
 * templates, lift `resources/views/emails/*.edge` and move {@link layout} into a partial.
 *
 * The runner builds an instance and hands it to `mail.sendLater(...)` — the queue takes over
 * so the runner's hot path doesn't block on SMTP latency.
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
        const hadFailures = counts.failed > 0;
        const accent = hadFailures ? "#f59e0b" : "#10b981";
        const title = hadFailures ? "وارد کردن با خطاهای جزئی تمام شد" : "وارد کردن محصولات با موفقیت انجام شد";
        const category = hadFailures ? "گزارش وارد کردن — با خطا" : "گزارش وارد کردن — موفق";

        const intro = `
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155">
                وارد کردن از فایل
                <strong style="color:#0f172a">${escapeHtml(fileName)}</strong>
                به پایان رسید.
            </p>
        `;
        const stats = statGrid([
            { label: "ایجاد شده", value: counts.created.toLocaleString("fa-IR"), tone: "success" },
            { label: "به‌روزرسانی", value: counts.updated.toLocaleString("fa-IR"), tone: "info" },
            { label: "رد شده", value: counts.skipped.toLocaleString("fa-IR"), tone: "muted" },
            { label: "ناموفق", value: counts.failed.toLocaleString("fa-IR"), tone: hadFailures ? "warning" : "muted" },
        ]);
        const duration = `
            <p style="margin:16px 0 0;font-size:13px;color:#64748b">
                مدت زمان اجرا: ${formatDuration(durationSec)}
            </p>
        `;

        this.message
            .to(to)
            .html(layout({ subject: title, category, title, accent, body: intro + stats + duration, footerId: `#${importId}` }));
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
        const body = `
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155">
                وارد کردن از فایل
                <strong style="color:#0f172a">${escapeHtml(fileName)}</strong>
                به دلیل خطای زیر متوقف شد:
            </p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;direction:ltr;text-align:left;font-family:Consolas,'SF Mono','Liberation Mono',monospace;font-size:12px;line-height:1.6;color:#7f1d1d;white-space:pre-wrap;overflow-wrap:break-word">${escapeHtml(message)}</div>
            <p style="margin:16px 0 0;font-size:13px;color:#64748b">
                لطفاً فایل را بررسی کرده و دوباره تلاش کنید.
            </p>
        `;
        this.message.to(to).html(
            layout({
                subject: this.subject,
                category: "خطای وارد کردن",
                title: this.subject,
                accent: "#dc2626",
                body,
                footerId: `#${importId}`,
            }),
        );
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
        const intro = `
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155">
                خروجی محصولات شما با موفقیت ساخته شد و آمادهٔ دانلود است.
            </p>
        `;
        const stats = statGrid([
            { label: "تعداد رکورد", value: rowCount.toLocaleString("fa-IR"), tone: "info" },
            { label: "اندازهٔ فایل", value: formatBytes(fileSizeBytes), tone: "info" },
        ]);
        const cta = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 8px">
                <tr><td align="center">
                    <a href="${downloadUrl}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:.2px">دانلود فایل</a>
                </td></tr>
            </table>
        `;
        const expiry = `
            <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;text-align:center">
                اعتبار لینک: ${formatExpiry(expiresAt)}
            </p>
        `;
        this.message.to(to).html(
            layout({
                subject: this.subject,
                category: "خروجی محصولات",
                title: this.subject,
                accent: "#2563eb",
                body: intro + stats + cta + expiry,
                footerId: `#${exportId}`,
            }),
        );
    }
}

interface LayoutOptions {
    subject: string;
    /** Small uppercase tag above the title, e.g. "گزارش وارد کردن — موفق". */
    category: string;
    title: string;
    /** Hex colour for the top accent bar. */
    accent: string;
    /** Pre-rendered HTML for the card body. Must already contain its own paragraph wrappers. */
    body: string;
    /** Job id shown in the footer, e.g. `#42`. */
    footerId: string;
}

/**
 * Email-client-safe centered-card shell. Table-based layout because Outlook desktop still
 * mangles div + flex/grid; styles are inlined for the same reason. Persian font stack falls
 * back to Tahoma (preinstalled on every Windows since XP) so glyphs render even if the client
 * lacks Vazirmatn / Iran Sans.
 */
function layout(opts: LayoutOptions): string {
    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Tahoma,Vazirmatn,'Iran Sans','Segoe UI',Arial,sans-serif;color:#0f172a;direction:rtl">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f5f7;padding:32px 16px">
        <tr><td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.08);overflow:hidden">
                <tr><td style="background:${opts.accent};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
                <tr><td style="padding:24px 28px 4px">
                    <div style="font-size:11px;color:#64748b;letter-spacing:.5px;text-transform:uppercase;font-weight:600">${escapeHtml(opts.category)}</div>
                    <h1 style="margin:6px 0 0;font-size:20px;line-height:1.4;font-weight:700;color:#0f172a">${escapeHtml(opts.title)}</h1>
                </td></tr>
                <tr><td style="padding:16px 28px 8px">${opts.body}</td></tr>
                <tr><td style="padding:16px 28px 24px;border-top:1px solid #f1f5f9">
                    <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">
                        شناسهٔ کار:
                        <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-family:Consolas,'SF Mono',monospace;direction:ltr;display:inline-block;color:#475569">${escapeHtml(opts.footerId)}</code>
                    </p>
                </td></tr>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#cbd5e1;text-align:center">این پیام به‌صورت خودکار از سامانه ارسال شده است.</p>
        </td></tr>
    </table>
</body>
</html>`;
}

type StatTone = "info" | "success" | "warning" | "muted";
interface Stat {
    label: string;
    value: string;
    tone: StatTone;
}

/** 2-column grid of labelled numbers. Email-safe (no flex/grid; per-cell tables). */
function statGrid(stats: Stat[]): string {
    const cells = stats.map((s) => statCell(s)).join("");
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;border-collapse:separate;border-spacing:8px"><tr>${cells}</tr></table>`;
}

function statCell(stat: Stat): string {
    const palette: Record<StatTone, { bg: string; value: string; label: string }> = {
        info: { bg: "#eff6ff", value: "#1d4ed8", label: "#1e3a8a" },
        success: { bg: "#ecfdf5", value: "#047857", label: "#065f46" },
        warning: { bg: "#fffbeb", value: "#b45309", label: "#92400e" },
        muted: { bg: "#f8fafc", value: "#475569", label: "#64748b" },
    };
    const c = palette[stat.tone];
    return `<td valign="top" style="width:50%;background:${c.bg};border-radius:8px;padding:12px 14px">
        <div style="font-size:11px;color:${c.label};font-weight:600;letter-spacing:.3px">${escapeHtml(stat.label)}</div>
        <div style="margin-top:4px;font-size:22px;font-weight:700;color:${c.value};line-height:1.2;direction:ltr;text-align:right">${escapeHtml(stat.value)}</div>
    </td>`;
}

/** "۱۲ ثانیه" / "۲ دقیقه و ۵ ثانیه" — Persian digits, Persian unit words. */
function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total.toLocaleString("fa-IR")} ثانیه`;
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    if (secs === 0) return `${minutes.toLocaleString("fa-IR")} دقیقه`;
    return `${minutes.toLocaleString("fa-IR")} دقیقه و ${secs.toLocaleString("fa-IR")} ثانیه`;
}

/** Human-readable byte count with Persian digits. */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت`;
    const mb = kb / 1024;
    return `${mb.toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت`;
}

/** Persian date + time, falling back to ISO if Intl doesn't know fa-IR-u-ca-persian. */
function formatExpiry(date: Date): string {
    try {
        const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
            dateStyle: "medium",
            timeStyle: "short",
        });
        return fmt.format(date);
    } catch {
        return date.toISOString();
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
