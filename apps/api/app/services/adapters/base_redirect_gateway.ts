import type { HttpContext } from "@adonisjs/core/http";

import type Order from "#models/order";
import type PaymentAttempt from "#models/payment_attempt";

/**
 * Shared shape across every PSP adapter. Controllers and the orchestrating
 * {@link PaymentService} branch on capabilities, never on the concrete adapter class — so adding a
 * new PSP is a `register()` call in `payment_adapter_registry.ts` and a class that implements this
 * contract.
 *
 * **Money units**: every monetary argument and return is in canonical Rial minor units (matches
 * `orders.grand_total`). PSP-specific conversions (e.g. legacy Toman/Rial divisor mess on some
 * older v3 adapters) live inside the concrete adapter — never leak to the call site.
 */
export interface PaymentAdapterCapabilities {
    /** PSP requires a browser redirect to a hosted page (vs. in-place capture or no-op). */
    redirect: boolean;
    /** PSP exposes a refund endpoint that the adapter can call. */
    refunds: boolean;
    /** PSP supports partial refunds (only meaningful when `refunds` is true). */
    partial_refunds: boolean;
}

export interface InitArgs {
    order: Order;
    attempt: PaymentAttempt;
    /** Decrypted gateway settings (merchant_id, api_key, …) sourced from `payment_gateways.settings`. */
    settings: Record<string, unknown>;
    /** Absolute callback URL the PSP should hand control back to after auth. */
    return_url: string;
}

export interface InitResult {
    /** PSP intermediate token (ZarinPal `Authority`, IDPay `id`). Persisted on the attempt row. */
    authority?: string;
    /** Where the storefront should redirect the browser. `null` for non-redirect gateways (cod, bank_transfer). */
    redirect_url: string | null;
    /** Free-form PSP payload for forensic stamping. */
    payload?: unknown;
}

export interface ParsedCallback {
    authority?: string;
    transaction_id?: string;
    status: "success" | "failed" | "cancelled";
    payload: unknown;
}

export interface ParseCallbackArgs {
    request: HttpContext["request"];
    settings: Record<string, unknown>;
}

export interface VerifyArgs {
    attempt: PaymentAttempt;
    callback: ParsedCallback;
    settings: Record<string, unknown>;
}

export type VerifyResult =
    | { ok: true; transaction_id: string; amount_minor?: number; payload: unknown }
    | { ok: false; error_code: string; error_message: string; payload: unknown };

export interface RefundArgs {
    attempt: PaymentAttempt;
    amount_minor: number;
    reason?: string;
    settings: Record<string, unknown>;
}

export type RefundResult =
    | { ok: true; gateway_refund_id: string; payload?: unknown }
    | { ok: false; error_code: string; error_message: string; payload?: unknown };

/**
 * Adapter contract. `init` is mandatory for every gateway. `parseCallback` / `verify` are
 * mandatory only for `capabilities.redirect=true` gateways — special adapters (`cod`,
 * `bank_transfer`) throw if these are called. `refund` is optional and only present when
 * `capabilities.refunds=true` AND the per-merchant settings haven't opted out.
 */
export interface PaymentAdapter {
    readonly code: string;
    readonly capabilities: PaymentAdapterCapabilities;

    init(args: InitArgs): Promise<InitResult>;
    parseCallback?(args: ParseCallbackArgs): ParsedCallback;
    verify?(args: VerifyArgs): Promise<VerifyResult>;
    refund?(args: RefundArgs): Promise<RefundResult>;
}

/**
 * Fetch helper with a hard timeout. Every adapter HTTP call goes through here so the standard
 * `error_code='gateway_timeout'` mapping in `payment_service.verifyCallback` covers DNS, TCP, TLS,
 * and server-side latency uniformly. Throws a tagged `Error` on timeout vs. network failure so the
 * caller can map distinctly.
 */
export async function timeoutFetch(
    url: string,
    init: RequestInit & { timeoutMs: number },
): Promise<{ status: number; body: unknown }> {
    const { timeoutMs, ...rest } = init;
    const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    const status = response.status;
    const text = await response.text();
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status, body };
}
