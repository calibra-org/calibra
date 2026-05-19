import type {
    InitArgs,
    InitResult,
    ParseCallbackArgs,
    ParsedCallback,
    PaymentAdapter,
    PaymentAdapterCapabilities,
    RefundArgs,
    RefundResult,
    VerifyArgs,
    VerifyResult,
} from "#services/adapters/base_redirect_gateway";
import { timeoutFetch } from "#services/adapters/base_redirect_gateway";

/** Hard-coded production URLs; per-merchant settings can override (sandbox / proxy). */
const DEFAULTS = {
    requestUrl: "https://payment.zarinpal.com/pg/v4/payment/request.json",
    verifyUrl: "https://payment.zarinpal.com/pg/v4/payment/verify.json",
    refundUrl: "https://payment.zarinpal.com/pg/v4/payment/refund.json",
    startPayBase: "https://payment.zarinpal.com/pg/StartPay/",
} as const;

const TIMEOUTS = { init: 5_000, verify: 10_000, refund: 10_000 } as const;

interface ZarinpalSettings {
    merchant_id?: string;
    request_url?: string;
    verify_url?: string;
    refund_url?: string;
    start_pay_base?: string;
    /** Per-merchant kill-switch even when capabilities.refunds=true. */
    refunds_enabled?: boolean;
    description_default?: string;
}

/**
 * ZarinPal v4 reference adapter.
 *
 * - **Money unit**: ZarinPal v4 takes Rial — matches our canonical unit, no divisor.
 * - **init** → POST request.json, returns `redirect_url = StartPay/{authority}`.
 * - **parseCallback** → GET callback with `?Authority=…&Status=OK|NOK`.
 * - **verify** → POST verify.json; `data.code === 100` is success, `ref_id` is the
 *   transaction id.
 * - **refund** → POST refund.json; the per-merchant `refunds_enabled=false` setting flips the
 *   capability off without changing code.
 */
export class ZarinpalGateway implements PaymentAdapter {
    readonly code = "zarinpal";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: true, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const settings = args.settings as ZarinpalSettings;
        if (!settings.merchant_id || settings.merchant_id.length === 0) {
            return { redirect_url: null, payload: { error: "merchant_id_missing" } };
        }
        const body = {
            merchant_id: settings.merchant_id,
            amount: Number(args.attempt.amountMinor),
            callback_url: args.return_url,
            description: settings.description_default ?? `Order #${args.order.orderNumber}`,
            metadata: {
                order_id: Number(args.order.id),
                order_number: Number(args.order.orderNumber),
            },
        };
        const response = await timeoutFetch(settings.request_url ?? DEFAULTS.requestUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            timeoutMs: TIMEOUTS.init,
        });
        const parsed = response.body as { data?: { code?: number; authority?: string }; errors?: unknown } | null;
        const code = parsed?.data?.code;
        const authority = parsed?.data?.authority;
        if (code !== 100 || !authority) {
            return { redirect_url: null, payload: parsed ?? { status: response.status } };
        }
        return {
            authority,
            redirect_url: `${settings.start_pay_base ?? DEFAULTS.startPayBase}${authority}`,
            payload: parsed,
        };
    }

    parseCallback(args: ParseCallbackArgs): ParsedCallback {
        const authority = args.request.qs().Authority ?? args.request.qs().authority;
        const statusRaw = args.request.qs().Status ?? args.request.qs().status;
        const payload = { Authority: authority, Status: statusRaw };
        if (typeof authority !== "string" || authority.length === 0) {
            return { status: "failed", payload };
        }
        const ok = String(statusRaw).toUpperCase() === "OK";
        return { authority, status: ok ? "success" : "cancelled", payload };
    }

    async verify(args: VerifyArgs): Promise<VerifyResult> {
        const settings = args.settings as ZarinpalSettings;
        const authority = args.callback.authority ?? args.attempt.gatewayAuthority ?? undefined;
        if (!authority) {
            return { ok: false, error_code: "missing_authority", error_message: "Missing PSP authority", payload: null };
        }
        const body = {
            merchant_id: settings.merchant_id,
            amount: Number(args.attempt.amountMinor),
            authority,
        };
        const response = await timeoutFetch(settings.verify_url ?? DEFAULTS.verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            timeoutMs: TIMEOUTS.verify,
        });
        const parsed = response.body as {
            data?: { code?: number; ref_id?: string | number; message?: string; amount?: number };
            errors?: unknown;
        } | null;
        const code = parsed?.data?.code;
        const refId = parsed?.data?.ref_id;
        const reportedAmount = parsed?.data?.amount;
        if (code === 100 && refId !== undefined && refId !== null) {
            const result: VerifyResult = { ok: true, transaction_id: String(refId), payload: parsed };
            if (typeof reportedAmount === "number") {
                (result as { amount_minor?: number }).amount_minor = reportedAmount;
            }
            return result;
        }
        return {
            ok: false,
            error_code: `verify_code_${code ?? "unknown"}`,
            error_message: parsed?.data?.message ?? `Verify returned code ${code ?? "unknown"}`,
            payload: parsed ?? { status: response.status },
        };
    }

    async refund(args: RefundArgs): Promise<RefundResult> {
        const settings = args.settings as ZarinpalSettings;
        if (settings.refunds_enabled === false) {
            return { ok: false, error_code: "refunds_disabled", error_message: "Refunds disabled for this merchant" };
        }
        const body = {
            merchant_id: settings.merchant_id,
            authority: args.attempt.gatewayAuthority,
            amount: args.amount_minor,
            description: args.reason ?? "refund",
        };
        const response = await timeoutFetch(settings.refund_url ?? DEFAULTS.refundUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            timeoutMs: TIMEOUTS.refund,
        });
        const parsed = response.body as {
            data?: { code?: number; refund_id?: string | number; message?: string };
        } | null;
        const code = parsed?.data?.code;
        const refundId = parsed?.data?.refund_id;
        if (code === 100 && refundId !== undefined && refundId !== null) {
            return { ok: true, gateway_refund_id: String(refundId), payload: parsed };
        }
        return {
            ok: false,
            error_code: `refund_code_${code ?? "unknown"}`,
            error_message: parsed?.data?.message ?? `Refund returned code ${code ?? "unknown"}`,
            payload: parsed ?? { status: response.status },
        };
    }
}

export const zarinpalGateway = new ZarinpalGateway();
