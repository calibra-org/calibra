import { randomBytes } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import { resolveCurrencyConfig } from "#services/currency_config_service";
import {
    canTransitionFactor,
    type FactorStatus,
    type FactorType,
    isFactorImmutable,
    isFactorStatus,
} from "#services/factor/lifecycle";
import { calculateFactorMoney } from "#services/factor/money";
import { allocateFactorReference } from "#services/factor/reference";
import type { FactorDocumentInput, FactorLineInput } from "#services/factor/types";
import { orderStateMachine } from "#services/order_state_machine";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { nextNumber } from "#services/tenant_numbering_service";

interface DocumentRow {
    id: number | string;
    tenant_id: number | string;
    order_id: number | string | null;
    customer_id: number | string | null;
    parent_document_id: number | string | null;
    type: FactorType;
    number: number | string | null;
    reference: string | null;
    locale: string;
    currency: string;
    currency_display: string;
    amount_minor: number | string;
    status: FactorStatus;
    delivery_channel: string;
    customer_snapshot: Record<string, unknown> | string;
    billing_snapshot: Record<string, unknown> | string;
    subtotal_minor: number | string;
    line_discount_minor: number | string;
    order_discount_minor: number | string;
    shipping_minor: number | string;
    tax_minor: number | string;
    rounding_minor: number | string;
    round_to_minor: number | string;
    payable_minor: number | string;
    tax_percent: number | string;
    customer_note: string | null;
    internal_note: string | null;
    due_at: Date | string | null;
    expires_at: Date | string | null;
    sent_at: Date | string | null;
    viewed_at: Date | string | null;
    paid_at: Date | string | null;
    cancelled_at: Date | string | null;
    issued_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
    version: number;
    attributes: Record<string, unknown> | string;
    collected_minor?: number | string;
}

interface ItemRow {
    id: number | string;
    product_id: number | string | null;
    variation_id: number | string | null;
    sku_snapshot: string | null;
    name_snapshot: string;
    description_snapshot: string | null;
    quantity: number;
    unit_price_minor: number | string;
    discount_percent: number | string;
    discount_minor: number | string;
    tax_percent: number | string;
    tax_minor: number | string;
    line_total_minor: number | string;
    position: number;
    attributes: Record<string, unknown> | string;
}

const JSON_COLUMNS = ["customer_snapshot", "billing_snapshot", "attributes"] as const;

function asJson(value: unknown): Record<string, unknown> {
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function iso(value: Date | string | null): string | null {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
}

function toNumber(value: number | string | null | undefined): number {
    return Number(value ?? 0);
}

function searchNeedle(value: string): string {
    const normalized = value
        .normalize("NFKC")
        .replaceAll("ي", "ی")
        .replaceAll("ك", "ک")
        .replaceAll("\u200c", " ")
        .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&");
    return `%${normalized}%`;
}

function normalizedLikeSql(expression: string): string {
    return `LOWER(REPLACE(REPLACE(REPLACE(${expression}, 'ي', 'ی'), 'ك', 'ک'), chr(8204), ' ')) LIKE ? ESCAPE '\\'`;
}

function serializeDocument(row: DocumentRow) {
    return {
        id: toNumber(row.id),
        order_id: row.order_id === null ? null : toNumber(row.order_id),
        customer_id: row.customer_id === null ? null : toNumber(row.customer_id),
        parent_document_id: row.parent_document_id === null ? null : toNumber(row.parent_document_id),
        type: row.type,
        number: row.number === null ? null : toNumber(row.number),
        reference: row.reference,
        locale: row.locale,
        currency: row.currency,
        currency_display: row.currency_display,
        amount_minor: toNumber(row.amount_minor),
        status: row.status,
        delivery_channel: row.delivery_channel,
        customer: asJson(row.customer_snapshot),
        billing: asJson(row.billing_snapshot),
        subtotal_minor: toNumber(row.subtotal_minor),
        line_discount_minor: toNumber(row.line_discount_minor),
        order_discount_minor: toNumber(row.order_discount_minor),
        shipping_minor: toNumber(row.shipping_minor),
        tax_minor: toNumber(row.tax_minor),
        rounding_minor: toNumber(row.rounding_minor),
        round_to_minor: toNumber(row.round_to_minor),
        payable_minor: toNumber(row.payable_minor),
        collected_minor: toNumber(row.collected_minor),
        outstanding_minor: Math.max(0, toNumber(row.payable_minor) - toNumber(row.collected_minor)),
        tax_percent: Number(row.tax_percent),
        customer_note: row.customer_note,
        internal_note: row.internal_note,
        due_at: iso(row.due_at),
        expires_at: iso(row.expires_at),
        sent_at: iso(row.sent_at),
        viewed_at: iso(row.viewed_at),
        paid_at: iso(row.paid_at),
        cancelled_at: iso(row.cancelled_at),
        issued_at: iso(row.issued_at),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        version: row.version,
        attributes: asJson(row.attributes),
    };
}

function serializeItem(row: ItemRow) {
    return {
        id: toNumber(row.id),
        product_id: row.product_id === null ? null : toNumber(row.product_id),
        variation_id: row.variation_id === null ? null : toNumber(row.variation_id),
        sku: row.sku_snapshot,
        name: row.name_snapshot,
        description: row.description_snapshot,
        quantity: Number(row.quantity),
        unit_price_minor: toNumber(row.unit_price_minor),
        discount_percent: Number(row.discount_percent),
        discount_minor: toNumber(row.discount_minor),
        tax_percent: Number(row.tax_percent),
        tax_minor: toNumber(row.tax_minor),
        line_total_minor: toNumber(row.line_total_minor),
        position: Number(row.position),
        attributes: asJson(row.attributes),
    };
}

function sqlDate(value: DateTime, field = "date"): string {
    const result = value.toSQL();
    if (!result) throw new Exception(`${field} is invalid`, { status: 422, code: "E_VALIDATION_ERROR" });
    return result;
}

function nowSql(): string {
    return sqlDate(DateTime.utc(), "now");
}

function parseOptionalDate(value: string | null | undefined, field: string): string | null {
    if (!value) return null;
    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) throw new Exception(`${field} is invalid`, { status: 422, code: "E_VALIDATION_ERROR" });
    return sqlDate(parsed.toUTC(), field);
}

function validateDocumentDates(dueAt: string | null, expiresAt: string | null): void {
    if (dueAt && expiresAt && DateTime.fromSQL(dueAt).toMillis() > DateTime.fromSQL(expiresAt).toMillis()) {
        throw new Exception("due_at cannot be after expires_at", { status: 422, code: "E_FACTOR_DATE_RANGE" });
    }
}

function ensureFutureDate(value: string, field: string): void {
    if (DateTime.fromSQL(value).toMillis() <= DateTime.utc().toMillis()) {
        throw new Exception(`${field} must be in the future`, { status: 422, code: "E_FACTOR_DATE_PAST" });
    }
}

const OFFLINE_GATEWAY_CODES = new Set(["cod", "bank_transfer"]);

function publicCode(): string {
    return randomBytes(18).toString("base64url").slice(0, 24);
}

function orderKey(): string {
    return randomBytes(16).toString("hex");
}

/** Tenant-scoped application service for invoice/proforma CRUD, lifecycle, payments and reports. */
export class FactorDocumentService {
    async list(input: {
        page?: number;
        limit?: number;
        q?: string;
        type?: FactorType;
        status?: FactorStatus;
        customer_id?: number;
        from?: string;
        to?: string;
        sort?: "created_desc" | "created_asc" | "due_asc" | "amount_desc";
    }) {
        const page = input.page ?? 1;
        const limit = input.limit ?? 25;
        const fromDate = parseOptionalDate(input.from, "from");
        const toDate = parseOptionalDate(input.to, "to");
        if (fromDate && toDate && DateTime.fromSQL(fromDate).toMillis() > DateTime.fromSQL(toDate).toMillis()) {
            throw new Exception("from cannot be after to", { status: 422, code: "E_FACTOR_DATE_RANGE" });
        }
        const rowsQuery = currentTrx()
            .from("order_documents as d")
            .whereIn("d.type", ["proforma", "invoice", "credit_note"])
            .select("d.*");
        const countQuery = currentTrx().from("order_documents as d").whereIn("d.type", ["proforma", "invoice", "credit_note"]);

        for (const query of [rowsQuery, countQuery]) {
            if (input.type) query.where("d.type", input.type);
            if (input.status) query.where("d.status", input.status);
            if (input.customer_id) query.where("d.customer_id", input.customer_id);
            if (fromDate) query.where("d.created_at", ">=", fromDate);
            if (toDate) query.where("d.created_at", "<=", toDate);
            if (input.q) {
                const needle = searchNeedle(input.q);
                query.where((sub) => {
                    sub.whereRaw(normalizedLikeSql("COALESCE(d.reference, '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(d.customer_snapshot->>'name', '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(d.customer_snapshot->>'email', '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(d.customer_snapshot->>'phone', '')"), [needle]);
                });
            }
        }

        switch (input.sort) {
            case "created_asc":
                rowsQuery.orderBy("d.created_at", "asc");
                break;
            case "due_asc":
                rowsQuery.orderByRaw("d.due_at ASC NULLS LAST");
                break;
            case "amount_desc":
                rowsQuery.orderBy("d.payable_minor", "desc");
                break;
            default:
                rowsQuery.orderBy("d.created_at", "desc");
        }

        const [countRow, rows] = await Promise.all([
            countQuery.countDistinct("d.id as total").first(),
            rowsQuery.offset((page - 1) * limit).limit(limit),
        ]);
        const documents = rows as DocumentRow[];
        const collection = await this.collectedMap(documents.map((row) => toNumber(row.id)));
        for (const row of documents) row.collected_minor = collection.get(toNumber(row.id)) ?? 0;
        const total = Number((countRow as { total?: string | number } | undefined)?.total ?? 0);
        return {
            data: documents.map(serializeDocument),
            meta: { page, limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
        };
    }

    async create(input: FactorDocumentInput, actorUserId: number | null) {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const now = nowSql();
        const dueAt = parseOptionalDate(input.due_at, "due_at");
        const expiresAt = parseOptionalDate(input.expires_at, "expires_at");
        validateDocumentDates(dueAt, expiresAt);
        if (expiresAt) ensureFutureDate(expiresAt, "expires_at");
        await this.validateRelations(input.customer_id ?? null, input.lines);
        const money = calculateFactorMoney(
            input.lines.map((line) => ({
                quantity: line.quantity,
                unitPriceMinor: line.unit_price_minor,
                discountPercent: line.discount_percent,
            })),
            {
                orderDiscountMinor: input.order_discount_minor,
                shippingMinor: input.shipping_minor,
                taxPercent: input.tax_percent,
                roundToMinor: input.round_to_minor,
            },
        );

        const [currencyConfig, generalSettings] = await Promise.all([
            resolveCurrencyConfig(),
            new SettingsService().all("general"),
        ]);
        const documentLocale = generalSettings.primary_locale === "en" ? "en" : "fa";
        const initialStatus: FactorStatus = input.status === "sent" ? "sent" : "draft";
        const allocated = initialStatus === "draft" ? null : await allocateFactorReference(input.type);
        const orderId = await this.createBackingOrder(input, money, {
            currency: currencyConfig.baseCode,
            currencyDisplay: currencyConfig.displayCode,
        });
        const customerSnapshot = {
            name: input.customer.name,
            email: input.customer.email ?? null,
            phone: input.customer.phone ?? null,
            company: input.customer.company ?? null,
            national_id: input.customer.national_id ?? null,
        };

        const [inserted] = await trx
            .table("order_documents")
            .insert({
                tenant_id: tenantId,
                order_id: orderId,
                customer_id: input.customer_id ?? null,
                parent_document_id: null,
                type: input.type,
                number: allocated?.number ?? null,
                reference: allocated?.reference ?? null,
                locale: documentLocale,
                currency: currencyConfig.baseCode,
                currency_display: currencyConfig.displayCode,
                amount_minor: money.payableMinor,
                status: initialStatus,
                delivery_channel: input.delivery_channel ?? "none",
                customer_snapshot: JSON.stringify(customerSnapshot),
                billing_snapshot: JSON.stringify(customerSnapshot),
                subtotal_minor: money.subtotalMinor,
                line_discount_minor: money.lineDiscountMinor,
                order_discount_minor: money.orderDiscountMinor,
                shipping_minor: money.shippingMinor,
                tax_minor: money.taxMinor,
                rounding_minor: money.roundingMinor,
                round_to_minor: input.round_to_minor ?? 1,
                payable_minor: money.payableMinor,
                tax_percent: input.tax_percent ?? 0,
                customer_note: input.customer_note ?? null,
                internal_note: input.internal_note ?? null,
                due_at: dueAt,
                expires_at: expiresAt,
                sent_at: initialStatus === "sent" ? now : null,
                issued_at: initialStatus === "sent" ? now : null,
                issued_by_user_id: initialStatus === "sent" ? actorUserId : null,
                created_by_user_id: actorUserId,
                attributes: JSON.stringify({ source: "admin_factor", schema_version: 1 }),
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        const documentId = Number((inserted as { id: number | string }).id);
        await this.replaceItems(documentId, input.lines, money, input.tax_percent ?? 0, now);
        await this.event(documentId, actorUserId, "document.created", { status: initialStatus, type: input.type });
        return this.detail(documentId);
    }

    async update(id: number, input: FactorDocumentInput, actorUserId: number | null) {
        const current = await this.findForUpdate(id);
        this.assertExpectedVersion(current, input.expected_version);
        if (isFactorImmutable(current.status)) {
            throw new Exception("Paid or credited documents cannot be edited", { status: 409, code: "E_FACTOR_IMMUTABLE" });
        }
        if (current.status !== "draft") {
            throw new Exception(
                "Issued documents cannot be financially edited; create a replacement document or use the dedicated credit-note workflow",
                {
                    status: 409,
                    code: "E_FACTOR_ISSUED_IMMUTABLE",
                },
            );
        }
        if (current.type !== input.type) {
            throw new Exception("Document type cannot be changed after creation", { status: 409, code: "E_FACTOR_TYPE_LOCKED" });
        }
        const dueAt = parseOptionalDate(input.due_at, "due_at");
        const expiresAt = parseOptionalDate(input.expires_at, "expires_at");
        validateDocumentDates(dueAt, expiresAt);
        if (expiresAt) ensureFutureDate(expiresAt, "expires_at");
        await this.validateRelations(input.customer_id ?? null, input.lines);
        const money = calculateFactorMoney(
            input.lines.map((line) => ({
                quantity: line.quantity,
                unitPriceMinor: line.unit_price_minor,
                discountPercent: line.discount_percent,
            })),
            {
                orderDiscountMinor: input.order_discount_minor,
                shippingMinor: input.shipping_minor,
                taxPercent: input.tax_percent,
                roundToMinor: input.round_to_minor ?? toNumber(current.round_to_minor),
            },
        );
        const alreadyCollected = toNumber(current.collected_minor);
        if (money.payableMinor < alreadyCollected) {
            throw new Exception("Document total cannot be lower than collected payments", {
                status: 422,
                code: "E_FACTOR_TOTAL_BELOW_COLLECTED",
            });
        }
        const now = nowSql();
        const snapshot = {
            name: input.customer.name,
            email: input.customer.email ?? null,
            phone: input.customer.phone ?? null,
            company: input.customer.company ?? null,
            national_id: input.customer.national_id ?? null,
        };
        const updatedRows = await currentTrx()
            .from("order_documents")
            .where("id", id)
            .where("version", current.version)
            .update({
                customer_id: input.customer_id ?? null,
                customer_snapshot: JSON.stringify(snapshot),
                billing_snapshot: JSON.stringify(snapshot),
                delivery_channel: input.delivery_channel ?? "none",
                subtotal_minor: money.subtotalMinor,
                line_discount_minor: money.lineDiscountMinor,
                order_discount_minor: money.orderDiscountMinor,
                shipping_minor: money.shippingMinor,
                tax_minor: money.taxMinor,
                rounding_minor: money.roundingMinor,
                round_to_minor: input.round_to_minor ?? toNumber(current.round_to_minor),
                payable_minor: money.payableMinor,
                amount_minor: money.payableMinor,
                tax_percent: input.tax_percent ?? 0,
                customer_note: input.customer_note ?? null,
                internal_note: input.internal_note ?? null,
                due_at: dueAt,
                expires_at: expiresAt,
                version: Number(current.version) + 1,
                updated_at: now,
            });
        if (Number(updatedRows) !== 1) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
        await this.replaceItems(id, input.lines, money, input.tax_percent ?? 0, now);
        if (current.order_id !== null) await this.syncBackingOrder(toNumber(current.order_id), input, money);
        await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
            status: "voided",
            updated_at: now,
        });
        await this.event(id, actorUserId, "document.updated", { version: Number(current.version) + 1 });
        return this.detail(id);
    }

    async detail(id: number) {
        const row = await this.findOrFail(id);
        const [items, events, payments, links, children] = await Promise.all([
            currentTrx().from("order_document_items").where("document_id", id).orderBy("position", "asc"),
            currentTrx().from("order_document_events").where("document_id", id).orderBy("created_at", "desc").limit(100),
            currentTrx()
                .from("factor_document_payments as p")
                .leftJoin("payment_gateways as g", "g.id", "p.gateway_id")
                .where("p.document_id", id)
                .select("p.*", "g.code as gateway_code")
                .orderBy("p.created_at", "desc"),
            currentTrx().from("payment_links").where("document_id", id).orderBy("created_at", "desc"),
            currentTrx()
                .from("order_documents")
                .where("parent_document_id", id)
                .whereIn("type", ["proforma", "invoice", "credit_note"])
                .select("id", "type", "status", "reference", "created_at")
                .orderBy("created_at", "asc"),
        ]);
        const collected = (payments as Array<{ amount_minor: number | string; status: string }>)
            .filter((payment) => payment.status === "paid")
            .reduce((sum, payment) => sum + toNumber(payment.amount_minor), 0);
        row.collected_minor = collected;
        return {
            data: {
                ...serializeDocument(row),
                items: (items as ItemRow[]).map(serializeItem),
                events: (events as Array<Record<string, unknown>>).map((event) => ({
                    id: toNumber(event.id as number | string),
                    event_type: String(event.event_type),
                    actor_user_id: event.actor_user_id === null ? null : toNumber(event.actor_user_id as number | string),
                    metadata: asJson(event.metadata),
                    created_at: iso(event.created_at as Date | string),
                })),
                payments: (payments as Array<Record<string, unknown>>).map((payment) => ({
                    id: toNumber(payment.id as number | string),
                    amount_minor: toNumber(payment.amount_minor as number | string),
                    method: String(payment.method),
                    status: String(payment.status),
                    reference: payment.reference ?? null,
                    notes: payment.notes ?? null,
                    gateway_code: payment.gateway_code ?? null,
                    paid_at: iso((payment.paid_at as Date | string | null) ?? null),
                    created_at: iso(payment.created_at as Date | string),
                })),
                payment_links: (links as Array<Record<string, unknown>>).map((link) => ({
                    id: toNumber(link.id as number | string),
                    code: String(link.code),
                    status: String(link.status),
                    gateway_id: link.gateway_id === null ? null : toNumber(link.gateway_id as number | string),
                    amount_minor: toNumber(link.amount_minor as number | string),
                    expires_at: iso((link.expires_at as Date | string | null) ?? null),
                    used_count: Number(link.used_count),
                    created_at: iso(link.created_at as Date | string),
                })),
                child_documents: (children as Array<Record<string, unknown>>).map((child) => ({
                    id: toNumber(child.id as number | string),
                    type: String(child.type),
                    status: String(child.status),
                    reference: child.reference ?? null,
                    created_at: iso(child.created_at as Date | string),
                })),
            },
        };
    }

    async transition(
        id: number,
        toStatus: FactorStatus,
        actorUserId: number | null,
        reason?: string | null,
        expectedVersion?: number,
    ) {
        if (toStatus === "refunded" || toStatus === "credited") {
            throw new Exception("Refunded and credited states require a dedicated accounting workflow", {
                status: 409,
                code: "E_FACTOR_ACCOUNTING_WORKFLOW_REQUIRED",
            });
        }
        const row = await this.findForUpdate(id);
        this.assertExpectedVersion(row, expectedVersion);
        if (!isFactorStatus(row.status) || !canTransitionFactor(row.status, toStatus)) {
            throw new Exception(`Cannot transition factor from ${row.status} to ${toStatus}`, {
                status: 409,
                code: "E_FACTOR_TRANSITION",
            });
        }
        if (toStatus === "paid") {
            const collected = await this.collected(id);
            if (collected < toNumber(row.payable_minor)) {
                throw new Exception("Document cannot be marked paid before the full amount is collected", {
                    status: 409,
                    code: "E_FACTOR_PAYMENT_INCOMPLETE",
                });
            }
        }
        const now = nowSql();
        const patch: Record<string, unknown> = { status: toStatus, updated_at: now, version: Number(row.version) + 1 };
        if ((toStatus === "sent" || toStatus === "viewed" || toStatus === "awaiting") && row.reference === null) {
            const allocated = await allocateFactorReference(row.type);
            patch.number = allocated.number;
            patch.reference = allocated.reference;
            patch.issued_at = now;
            patch.issued_by_user_id = actorUserId;
        }
        if (toStatus === "sent") patch.sent_at = now;
        if (toStatus === "viewed") patch.viewed_at = now;
        if (toStatus === "paid") patch.paid_at = now;
        if (toStatus === "cancelled") patch.cancelled_at = now;
        const updatedRows = await currentTrx()
            .from("order_documents")
            .where("id", id)
            .where("version", row.version)
            .update(patch);
        if (Number(updatedRows) !== 1) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
        if (toStatus === "paid") {
            await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
                status: "paid",
                used_count: 1,
                updated_at: now,
            });
        } else if (toStatus === "expired") {
            await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
                status: "expired",
                updated_at: now,
            });
        } else if (["cancelled", "refunded", "credited"].includes(toStatus)) {
            await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
                status: "voided",
                updated_at: now,
            });
        }
        if (row.order_id !== null) {
            const orderId = toNumber(row.order_id);
            if (toStatus === "paid") await this.moveBackingOrderToProcessing(orderId, "factor.document.paid");
            if (toStatus === "cancelled" || toStatus === "expired") {
                await this.cancelBackingOrder(orderId, `factor.document.${toStatus}`);
            }
        }
        await this.event(id, actorUserId, `document.${toStatus}`, { reason: reason ?? null, from: row.status });
        return this.detail(id);
    }

    async convert(
        id: number,
        targetType: "invoice" | "credit_note",
        actorUserId: number | null,
        expectedVersion?: number,
        reason?: string | null,
    ) {
        const source = await this.findForUpdate(id);
        this.assertExpectedVersion(source, expectedVersion);
        if (targetType === "invoice" && source.type !== "proforma") {
            throw new Exception("Only a proforma can be converted to an invoice", { status: 409, code: "E_FACTOR_CONVERT" });
        }
        if (targetType === "invoice" && ["expired", "cancelled", "refunded", "credited"].includes(source.status)) {
            throw new Exception("A closed proforma cannot be converted to an invoice", {
                status: 409,
                code: "E_FACTOR_CONVERT_CLOSED",
            });
        }
        if (targetType === "credit_note" && (source.type !== "invoice" || source.status !== "paid")) {
            throw new Exception("A credit note requires a paid invoice", { status: 409, code: "E_FACTOR_CONVERT" });
        }
        const existing = await currentTrx()
            .from("order_documents")
            .where("parent_document_id", id)
            .where("type", targetType)
            .first();
        if (existing) {
            throw new Exception("This document has already been converted", {
                status: 409,
                code: "E_FACTOR_ALREADY_CONVERTED",
            });
        }

        const now = nowSql();
        const isCredit = targetType === "credit_note";
        const childStatus: FactorStatus = isCredit ? "credited" : source.status;
        const childNeedsReference = isCredit || source.reference !== null || childStatus !== "draft";
        const allocated = childNeedsReference ? await allocateFactorReference(targetType) : null;
        const [inserted] = await currentTrx()
            .table("order_documents")
            .insert({
                tenant_id: currentTenantId(),
                order_id: isCredit ? null : source.order_id,
                customer_id: source.customer_id,
                parent_document_id: id,
                type: targetType,
                number: allocated?.number ?? null,
                reference: allocated?.reference ?? null,
                locale: source.locale,
                currency: source.currency,
                currency_display: source.currency_display,
                amount_minor: source.amount_minor,
                status: childStatus,
                delivery_channel: source.delivery_channel,
                customer_snapshot: JSON.stringify(asJson(source.customer_snapshot)),
                billing_snapshot: JSON.stringify(asJson(source.billing_snapshot)),
                subtotal_minor: source.subtotal_minor,
                line_discount_minor: source.line_discount_minor,
                order_discount_minor: source.order_discount_minor,
                shipping_minor: source.shipping_minor,
                tax_minor: source.tax_minor,
                rounding_minor: source.rounding_minor,
                round_to_minor: source.round_to_minor,
                payable_minor: source.payable_minor,
                tax_percent: source.tax_percent,
                customer_note: source.customer_note,
                internal_note: reason ?? source.internal_note,
                due_at: isCredit ? null : source.due_at,
                expires_at: isCredit ? null : source.expires_at,
                sent_at: isCredit ? null : source.sent_at,
                viewed_at: isCredit ? null : source.viewed_at,
                paid_at: !isCredit && childStatus === "paid" ? (source.paid_at ?? now) : null,
                issued_at: childNeedsReference ? now : null,
                issued_by_user_id: childNeedsReference ? actorUserId : null,
                created_by_user_id: actorUserId,
                version: 1,
                attributes: JSON.stringify({
                    source: "factor_conversion",
                    source_document_id: id,
                    accounting_effect: isCredit ? "negative" : "neutral",
                    reason: reason ?? null,
                }),
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        const childId = Number((inserted as { id: number | string }).id);
        const sourceItems = (await currentTrx()
            .from("order_document_items")
            .where("document_id", id)
            .orderBy("position", "asc")) as ItemRow[];
        if (sourceItems.length > 0) {
            await currentTrx()
                .table("order_document_items")
                .insert(
                    sourceItems.map((item) => ({
                        tenant_id: currentTenantId(),
                        document_id: childId,
                        product_id: item.product_id,
                        variation_id: item.variation_id,
                        sku_snapshot: item.sku_snapshot,
                        name_snapshot: item.name_snapshot,
                        description_snapshot: item.description_snapshot,
                        quantity: item.quantity,
                        unit_price_minor: item.unit_price_minor,
                        discount_percent: item.discount_percent,
                        discount_minor: item.discount_minor,
                        tax_percent: item.tax_percent,
                        tax_minor: item.tax_minor,
                        line_total_minor: item.line_total_minor,
                        position: item.position,
                        attributes: JSON.stringify(asJson(item.attributes)),
                        created_at: now,
                        updated_at: now,
                    })),
                );
        }

        const sourcePatch: Record<string, unknown> = {
            version: Number(source.version) + 1,
            updated_at: now,
            status: isCredit ? "credited" : "cancelled",
            cancelled_at: isCredit ? source.cancelled_at : now,
        };
        const sourceUpdatedRows = await currentTrx()
            .from("order_documents")
            .where("id", id)
            .where("version", source.version)
            .update(sourcePatch);
        if (Number(sourceUpdatedRows) !== 1) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
        if (!isCredit) {
            await currentTrx()
                .from("factor_document_payments")
                .where("document_id", id)
                .update({ document_id: childId, updated_at: now });
            await currentTrx()
                .from("payment_links")
                .where("document_id", id)
                .update({
                    document_id: childId,
                    description: allocated?.reference ? `Payment for ${allocated.reference}` : `Payment for document ${childId}`,
                    updated_at: now,
                });
        } else {
            await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
                status: "voided",
                updated_at: now,
            });
        }
        await this.event(id, actorUserId, "document.converted", {
            target_document_id: childId,
            target_type: targetType,
            reason: reason ?? null,
        });
        await this.event(childId, actorUserId, "document.created_from", { source_document_id: id });
        return this.detail(childId);
    }

    async createPaymentLink(
        id: number,
        gatewayId: number,
        expiresAt: string | null | undefined,
        actorUserId: number | null,
        expectedVersion?: number,
    ) {
        const row = await this.findForUpdate(id);
        this.assertExpectedVersion(row, expectedVersion);
        if (row.type === "credit_note" || ["paid", "cancelled", "expired", "refunded", "credited"].includes(row.status)) {
            throw new Exception("This document cannot accept payments", { status: 409, code: "E_FACTOR_PAYMENT_CLOSED" });
        }
        if (row.order_id === null)
            throw new Exception("Document has no backing order", { status: 409, code: "E_FACTOR_ORDER_MISSING" });
        const collected = await this.collected(id);
        const outstanding = Math.max(0, toNumber(row.payable_minor) - collected);
        if (outstanding <= 0) {
            throw new Exception("Document has no outstanding balance", { status: 409, code: "E_FACTOR_ALREADY_PAID" });
        }
        if (collected > 0) {
            throw new Exception("Online payment links cannot be created after a partial manual payment", {
                status: 409,
                code: "E_FACTOR_PARTIAL_PAYMENT_LINK_UNSUPPORTED",
            });
        }
        const gateway = await currentTrx().from("payment_gateways").where("id", gatewayId).where("enabled", true).first();
        if (!gateway) {
            throw new Exception("Payment gateway is unavailable", { status: 422, code: "E_PAYMENT_GATEWAY_INVALID" });
        }
        const pendingOfflineLink = await currentTrx()
            .from("payment_links")
            .where("document_id", id)
            .where("status", "pending")
            .where("used_count", ">", 0)
            .first();
        if (pendingOfflineLink) {
            throw new Exception("An offline payment is awaiting financial reconciliation", {
                status: 409,
                code: "E_FACTOR_OFFLINE_RECONCILIATION_PENDING",
            });
        }

        const code = publicCode();
        const now = nowSql();
        const expiry =
            parseOptionalDate(expiresAt, "expires_at") ??
            (row.expires_at
                ? sqlDate(DateTime.fromJSDate(new Date(row.expires_at)).toUTC(), "expires_at")
                : sqlDate(DateTime.utc().plus({ days: 7 }), "expires_at"));
        ensureFutureDate(expiry, "expires_at");

        await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
            status: "voided",
            updated_at: now,
        });
        await currentTrx()
            .table("payment_links")
            .insert({
                tenant_id: currentTenantId(),
                code,
                status: "active",
                gateway_id: gatewayId,
                amount_minor: outstanding,
                currency: row.currency,
                description: row.reference ? `Payment for ${row.reference}` : `Payment for document ${id}`,
                max_uses: 1,
                used_count: 0,
                expires_at: expiry,
                order_id: row.order_id,
                document_id: id,
                created_by_user_id: actorUserId,
                attributes: JSON.stringify({ factor_reference: row.reference }),
                created_at: now,
                updated_at: now,
            });

        let targetStatus: FactorStatus = row.status;
        if (row.status === "draft") targetStatus = "sent";
        else if (row.status === "sent" || row.status === "viewed") targetStatus = "awaiting";
        const documentPatch: Record<string, unknown> = {
            status: targetStatus,
            version: Number(row.version) + 1,
            updated_at: now,
        };
        if (row.reference === null) {
            const allocated = await allocateFactorReference(row.type);
            documentPatch.number = allocated.number;
            documentPatch.reference = allocated.reference;
            documentPatch.issued_at = now;
            documentPatch.issued_by_user_id = actorUserId;
        }
        if (targetStatus === "sent") documentPatch.sent_at = now;
        const documentUpdatedRows = await currentTrx()
            .from("order_documents")
            .where("id", id)
            .where("version", row.version)
            .update(documentPatch);
        if (Number(documentUpdatedRows) !== 1) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
        await this.ensureBackingOrderPending(toNumber(row.order_id), "factor.payment_link.created");
        await currentTrx().from("orders").where("id", row.order_id).update({
            payment_gateway_id_snapshot: gatewayId,
            payment_method_code_snapshot: gateway.code,
            payment_method_title_snapshot: gateway.code,
            updated_at: now,
        });
        await this.event(id, actorUserId, "payment_link.created", { code, gateway_id: gatewayId, expires_at: expiry });
        return { data: { code, expires_at: iso(expiry), path: `/pay/${code}` } };
    }

    async recordManualPayment(
        id: number,
        input: {
            amount_minor: number;
            method: string;
            reference?: string | null;
            notes?: string | null;
            paid_at?: string | null;
            expected_version?: number;
        },
        actorUserId: number | null,
    ) {
        const row = await this.findForUpdate(id);
        this.assertExpectedVersion(row, input.expected_version);
        if (row.type === "credit_note" || ["paid", "cancelled", "expired", "refunded", "credited"].includes(row.status)) {
            throw new Exception("This document cannot accept payments", { status: 409, code: "E_FACTOR_PAYMENT_CLOSED" });
        }
        const alreadyCollected = await this.collected(id);
        const outstanding = Math.max(0, toNumber(row.payable_minor) - alreadyCollected);
        if (input.amount_minor > outstanding) {
            throw new Exception("Payment amount exceeds the outstanding balance", {
                status: 422,
                code: "E_FACTOR_PAYMENT_EXCEEDS_OUTSTANDING",
            });
        }
        const now = nowSql();
        const paidAt = parseOptionalDate(input.paid_at, "paid_at") ?? now;
        if (DateTime.fromSQL(paidAt).toMillis() > DateTime.utc().plus({ minutes: 5 }).toMillis()) {
            throw new Exception("paid_at cannot be in the future", { status: 422, code: "E_FACTOR_PAYMENT_DATE_FUTURE" });
        }
        const normalizedReference = input.reference?.trim() || null;
        if (["bank_transfer", "card"].includes(input.method) && normalizedReference === null) {
            throw new Exception("A tracking reference is required for bank and card payments", {
                status: 422,
                code: "E_FACTOR_PAYMENT_REFERENCE_REQUIRED",
            });
        }
        if (normalizedReference !== null) {
            const duplicate = await currentTrx()
                .from("factor_document_payments")
                .where("document_id", id)
                .where("method", input.method)
                .whereRaw("LOWER(reference) = LOWER(?)", [normalizedReference])
                .where("status", "paid")
                .first();
            if (duplicate) {
                throw new Exception("This payment reference has already been recorded for the document", {
                    status: 409,
                    code: "E_FACTOR_PAYMENT_DUPLICATE_REFERENCE",
                });
            }
        }
        await currentTrx()
            .table("factor_document_payments")
            .insert({
                tenant_id: currentTenantId(),
                document_id: id,
                amount_minor: input.amount_minor,
                method: input.method,
                status: "paid",
                reference: normalizedReference,
                notes: input.notes ?? null,
                paid_at: paidAt,
                created_by_user_id: actorUserId,
                attributes: JSON.stringify({ source: "admin" }),
                created_at: now,
                updated_at: now,
            });
        const paid = alreadyCollected + input.amount_minor;
        let nextStatus: FactorStatus = row.status;
        if (paid >= toNumber(row.payable_minor)) nextStatus = "paid";
        else if (["draft", "sent", "viewed"].includes(row.status)) nextStatus = "awaiting";

        const patch: Record<string, unknown> = {
            status: nextStatus,
            version: Number(row.version) + 1,
            updated_at: now,
        };
        if (row.reference === null) {
            const allocated = await allocateFactorReference(row.type);
            patch.number = allocated.number;
            patch.reference = allocated.reference;
            patch.issued_at = now;
            patch.issued_by_user_id = actorUserId;
            patch.sent_at = now;
        }
        if (nextStatus === "paid") patch.paid_at = paidAt;
        const documentUpdatedRows = await currentTrx()
            .from("order_documents")
            .where("id", id)
            .where("version", row.version)
            .update(patch);
        if (Number(documentUpdatedRows) !== 1) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
        if (row.order_id !== null) {
            if (nextStatus === "paid") {
                await this.moveBackingOrderToProcessing(toNumber(row.order_id), "factor.payment.manual.full");
            } else {
                await this.moveBackingOrderToOnHold(toNumber(row.order_id), "factor.payment.manual.partial");
            }
        }
        if (nextStatus === "paid") {
            await currentTrx().from("payment_links").where("document_id", id).whereIn("status", ["active", "pending"]).update({
                status: "paid",
                used_count: 1,
                updated_at: now,
            });
        }
        await this.event(id, actorUserId, "payment.recorded", {
            amount_minor: input.amount_minor,
            method: input.method,
            reference: normalizedReference,
        });
        return this.detail(id);
    }

    async summary() {
        const trx = currentTrx();
        const [statusRows, aggregate, overdue] = await Promise.all([
            trx
                .from("order_documents")
                .whereIn("type", ["proforma", "invoice", "credit_note"])
                .groupBy("status")
                .select("status")
                .count("* as count")
                .sum("payable_minor as amount"),
            trx.rawQuery<{
                rows: Array<{
                    total_documents: string | number;
                    gross_invoiced_minor: string | number;
                    credited_minor: string | number;
                    total_issued_minor: string | number;
                    collected_minor: string | number;
                    outstanding_minor: string | number;
                }>;
            }>(
                `SELECT COUNT(*)::bigint AS total_documents,
                        COALESCE(SUM(CASE WHEN d.type = 'invoice' AND d.status NOT IN ('draft','cancelled')
                                          THEN d.payable_minor ELSE 0 END), 0)::bigint AS gross_invoiced_minor,
                        COALESCE(SUM(CASE WHEN d.type = 'credit_note' AND d.status = 'credited'
                                          THEN d.payable_minor ELSE 0 END), 0)::bigint AS credited_minor,
                        COALESCE(SUM(CASE
                            WHEN d.type = 'invoice' AND d.status NOT IN ('draft','cancelled') THEN d.payable_minor
                            WHEN d.type = 'credit_note' AND d.status = 'credited' THEN -d.payable_minor
                            ELSE 0 END), 0)::bigint AS total_issued_minor,
                        COALESCE((SELECT SUM(CASE WHEN fp.status = 'paid' THEN fp.amount_minor
                                                 WHEN fp.status = 'refunded' THEN -fp.amount_minor ELSE 0 END)
                                    FROM factor_document_payments fp), 0)::bigint AS collected_minor,
                        COALESCE(SUM(CASE
                            WHEN d.type = 'invoice' AND d.status IN ('sent','viewed','awaiting','expired')
                            THEN GREATEST(d.payable_minor - COALESCE(p.collected_minor, 0), 0)
                            ELSE 0 END), 0)::bigint AS outstanding_minor
                   FROM order_documents d
              LEFT JOIN (
                        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount_minor
                                                    WHEN status = 'refunded' THEN -amount_minor ELSE 0 END)::bigint AS collected_minor
                          FROM factor_document_payments
                         GROUP BY document_id
                        ) p ON p.document_id = d.id
                  WHERE d.type IN ('proforma','invoice','credit_note')`,
            ),
            trx.rawQuery<{ rows: Array<{ count: string | number; amount: string | number }> }>(
                `SELECT COUNT(*)::bigint AS count,
                        COALESCE(SUM(GREATEST(d.payable_minor - COALESCE(p.collected_minor, 0), 0)), 0)::bigint AS amount
                   FROM order_documents d
              LEFT JOIN (
                        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount_minor
                                                    WHEN status = 'refunded' THEN -amount_minor ELSE 0 END)::bigint AS collected_minor
                          FROM factor_document_payments
                         GROUP BY document_id
                        ) p ON p.document_id = d.id
                  WHERE d.type = 'invoice'
                    AND d.status IN ('sent','viewed','awaiting','expired')
                    AND d.due_at < now()
                    AND GREATEST(d.payable_minor - COALESCE(p.collected_minor, 0), 0) > 0`,
            ),
        ]);
        const counts: Record<string, { count: number; amount_minor: number }> = {};
        for (const row of statusRows as Array<Record<string, unknown>>) {
            counts[String(row.status)] = { count: Number(row.count), amount_minor: Number(row.amount ?? 0) };
        }
        const totals = aggregate.rows[0];
        const overdueRow = overdue.rows[0];
        return {
            data: {
                statuses: counts,
                total_documents: Number(totals?.total_documents ?? 0),
                gross_invoiced_minor: Number(totals?.gross_invoiced_minor ?? 0),
                credited_minor: Number(totals?.credited_minor ?? 0),
                total_issued_minor: Number(totals?.total_issued_minor ?? 0),
                collected_minor: Number(totals?.collected_minor ?? 0),
                outstanding_minor: Number(totals?.outstanding_minor ?? 0),
                overdue_count: Number(overdueRow?.count ?? 0),
                overdue_minor: Number(overdueRow?.amount ?? 0),
            },
        };
    }

    async reports() {
        const trx = currentTrx();
        const [monthly, aging, channels, gateways] = await Promise.all([
            trx.rawQuery<{ rows: Array<Record<string, unknown>> }>(
                `SELECT date_trunc('month', COALESCE(d.issued_at, d.created_at)) AS bucket,
                        COUNT(*) FILTER (WHERE d.type IN ('invoice','credit_note'))::bigint AS documents,
                        COALESCE(SUM(CASE
                            WHEN d.type = 'invoice' AND d.status NOT IN ('draft','cancelled') THEN d.payable_minor
                            WHEN d.type = 'credit_note' AND d.status = 'credited' THEN -d.payable_minor
                            ELSE 0 END), 0)::bigint AS issued_minor,
                        COALESCE(SUM(COALESCE(p.collected_minor, 0)), 0)::bigint AS paid_minor
                   FROM order_documents d
              LEFT JOIN (
                        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount_minor
                                                    WHEN status = 'refunded' THEN -amount_minor ELSE 0 END)::bigint AS collected_minor
                          FROM factor_document_payments
                         GROUP BY document_id
                        ) p ON p.document_id = d.id
                  WHERE d.type IN ('invoice','credit_note')
                    AND COALESCE(d.issued_at, d.created_at) >= now() - interval '12 months'
                    AND d.status NOT IN ('draft','cancelled')
                  GROUP BY 1 ORDER BY 1`,
            ),
            trx.rawQuery<{ rows: Array<Record<string, unknown>> }>(
                `SELECT CASE
                          WHEN d.due_at IS NULL OR d.due_at >= now() THEN 'current'
                          WHEN d.due_at >= now() - interval '30 days' THEN '1_30'
                          WHEN d.due_at >= now() - interval '60 days' THEN '31_60'
                          WHEN d.due_at >= now() - interval '90 days' THEN '61_90'
                          ELSE '90_plus'
                        END AS bucket,
                        COUNT(*)::bigint AS count,
                        COALESCE(SUM(GREATEST(d.payable_minor - COALESCE(p.collected_minor, 0), 0)),0)::bigint AS amount_minor
                   FROM order_documents d
              LEFT JOIN (
                        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount_minor
                                                    WHEN status = 'refunded' THEN -amount_minor ELSE 0 END)::bigint AS collected_minor
                          FROM factor_document_payments
                         GROUP BY document_id
                        ) p ON p.document_id = d.id
                  WHERE d.type = 'invoice'
                    AND d.status IN ('sent','viewed','awaiting','expired')
                    AND GREATEST(d.payable_minor - COALESCE(p.collected_minor, 0), 0) > 0
                  GROUP BY 1`,
            ),
            trx.rawQuery<{ rows: Array<Record<string, unknown>> }>(
                `SELECT d.delivery_channel,
                        COUNT(*)::bigint AS count,
                        COALESCE(SUM(CASE WHEN d.type = 'credit_note' THEN -d.payable_minor ELSE d.payable_minor END), 0)::bigint AS amount_minor
                   FROM order_documents d
                  WHERE d.type IN ('invoice','credit_note')
                    AND d.status NOT IN ('draft','cancelled')
                  GROUP BY d.delivery_channel
                  ORDER BY amount_minor DESC`,
            ),
            trx.rawQuery<{ rows: Array<Record<string, unknown>> }>(
                `SELECT COALESCE(g.code, 'manual') AS gateway,
                        COUNT(*)::bigint AS count,
                        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_minor
                                          WHEN p.status = 'refunded' THEN -p.amount_minor ELSE 0 END),0)::bigint AS amount_minor
                   FROM factor_document_payments p
              LEFT JOIN payment_gateways g ON g.id = p.gateway_id
                  WHERE p.status IN ('paid','refunded')
                  GROUP BY 1 ORDER BY amount_minor DESC`,
            ),
        ]);
        const normalize = (row: Record<string, unknown>) =>
            Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                    key,
                    /(_minor|count|documents)$/.test(key) ? Number(value ?? 0) : value,
                ]),
            );
        return {
            data: {
                monthly: monthly.rows.map((row) => ({ ...normalize(row), bucket: iso(row.bucket as Date | string) })),
                aging: aging.rows.map(normalize),
                channels: channels.rows.map(normalize),
                gateways: gateways.rows.map(normalize),
            },
        };
    }

    async searchResources(kind: "customers" | "products", q = "", limit = 20) {
        const needle = searchNeedle(q);
        if (kind === "customers") {
            const rowsQuery = currentTrx()
                .from("customers as c")
                .leftJoin("users as u", "u.id", "c.user_id")
                .leftJoin("customer_iran_profiles as cip", "cip.customer_id", "c.id")
                .whereNull("c.deleted_at");
            if (q) {
                rowsQuery.where((sub) => {
                    sub.whereRaw(normalizedLikeSql("c.first_name || ' ' || c.last_name"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(c.phone, '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(u.email, '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(cip.legal_company_name_fa, '')"), [needle])
                        .orWhereRaw(normalizedLikeSql("COALESCE(cip.national_id, cip.corporate_national_id, '')"), [needle]);
                });
            }
            const rows = await rowsQuery
                .select(
                    "c.id",
                    "c.first_name",
                    "c.last_name",
                    "c.phone",
                    "u.email",
                    "cip.legal_company_name_fa as company",
                    currentTrx().raw("COALESCE(cip.national_id, cip.corporate_national_id) AS national_id"),
                )
                .orderBy("c.created_at", "desc")
                .limit(limit);
            return {
                data: (rows as Array<Record<string, unknown>>).map((row) => ({
                    id: toNumber(row.id as number | string),
                    name: `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim(),
                    phone: row.phone ?? null,
                    email: row.email ?? null,
                    company: row.company ?? null,
                    national_id: row.national_id ?? null,
                })),
            };
        }
        const generalSettings = await new SettingsService().all("general");
        const productLocale = generalSettings.primary_locale === "en" ? "en" : "fa";
        const productsQuery = currentTrx()
            .from("products as p")
            .leftJoin("product_translations as t", (join) => {
                join.on("t.product_id", "=", "p.id").andOnVal("t.locale", "=", productLocale);
            })
            .where("p.status", "publish")
            .whereNull("p.deleted_at");
        if (q) {
            productsQuery.where((sub) => {
                sub.whereRaw(normalizedLikeSql("COALESCE(t.name, '')"), [needle])
                    .orWhereRaw(normalizedLikeSql("COALESCE(p.sku, '')"), [needle])
                    .orWhereRaw(
                        `EXISTS (SELECT 1 FROM product_variations pv
                                  WHERE pv.product_id = p.id AND pv.deleted_at IS NULL AND pv.status = 'active'
                                    AND ${normalizedLikeSql("COALESCE(pv.sku, '')")})`,
                        [needle],
                    );
            });
        }
        const rows = (await productsQuery
            .select("p.id", "p.sku", "p.regular_price", "p.sale_price", "p.sale_starts_at", "p.sale_ends_at", "t.name")
            .orderBy("p.created_at", "desc")
            .limit(limit)) as Array<Record<string, unknown>>;
        const productIds = rows.map((row) => toNumber(row.id as number | string));
        const variations =
            productIds.length === 0
                ? []
                : ((await currentTrx()
                      .from("product_variations")
                      .whereIn("product_id", productIds)
                      .whereNull("deleted_at")
                      .where("status", "active")
                      .select("id", "product_id", "sku", "regular_price", "sale_price", "sale_starts_at", "sale_ends_at")
                      .orderBy("menu_order", "asc")
                      .orderBy("id", "asc")) as Array<Record<string, unknown>>);
        const variationsByProduct = new Map<number, Array<Record<string, unknown>>>();
        for (const variation of variations) {
            const productId = toNumber(variation.product_id as number | string);
            const bucket = variationsByProduct.get(productId) ?? [];
            bucket.push(variation);
            variationsByProduct.set(productId, bucket);
        }
        const activePrice = (row: Record<string, unknown>, fallback = 0): number => {
            const now = Date.now();
            const starts = row.sale_starts_at ? new Date(String(row.sale_starts_at)).getTime() : Number.NEGATIVE_INFINITY;
            const ends = row.sale_ends_at ? new Date(String(row.sale_ends_at)).getTime() : Number.POSITIVE_INFINITY;
            const saleIsActive = row.sale_price !== null && row.sale_price !== undefined && starts <= now && now <= ends;
            return toNumber((saleIsActive ? row.sale_price : (row.regular_price ?? fallback)) as number | string);
        };
        return {
            data: rows.flatMap((row) => {
                const productId = toNumber(row.id as number | string);
                const productName = String(row.name ?? `#${row.id}`);
                const parent = {
                    id: productId,
                    variation_id: null,
                    name: productName,
                    sku: row.sku ?? null,
                    unit_price_minor: activePrice(row),
                };
                const children = (variationsByProduct.get(productId) ?? []).map((variation) => ({
                    id: productId,
                    variation_id: toNumber(variation.id as number | string),
                    name: `${productName} — ${String(variation.sku ?? `#${variation.id}`)}`,
                    sku: variation.sku ?? row.sku ?? null,
                    unit_price_minor: activePrice(variation, activePrice(row)),
                }));
                const parentHasPrice = row.regular_price !== null || row.sale_price !== null;
                if (children.length > 0 && !parentHasPrice) return children;
                return children.length > 0 ? [parent, ...children] : [parent];
            }),
        };
    }

    async publicByCode(code: string) {
        const link = await currentTrx()
            .from("payment_links as l")
            .join("order_documents as d", "d.id", "l.document_id")
            .leftJoin("payment_gateways as g", "g.id", "l.gateway_id")
            .where("l.code", code)
            .select(
                "l.*",
                "d.reference",
                "d.status as document_status",
                "d.customer_snapshot",
                "d.subtotal_minor",
                "d.line_discount_minor",
                "d.order_discount_minor",
                "d.shipping_minor",
                "d.tax_minor",
                "d.rounding_minor",
                "d.payable_minor",
                "d.currency_display",
                "d.expires_at as document_expires_at",
                "d.customer_note",
                "g.code as gateway_code",
                "d.id as document_id",
            )
            .first();
        if (!link) throw new Exception("Payment link not found", { status: 404, code: "E_NOT_FOUND" });

        const documentId = toNumber(link.document_id as number | string);
        const payableMinor = toNumber(link.payable_minor as number | string);
        const collectedMinor = await this.collected(documentId);
        let documentStatus = String(link.document_status) as FactorStatus;
        let linkStatus = String(link.status);
        if (payableMinor > 0 && collectedMinor >= payableMinor) {
            documentStatus = "paid";
            linkStatus = "paid";
        }
        if (["cancelled", "refunded", "credited"].includes(documentStatus)) {
            throw new Exception("Payment link is no longer payable", { status: 410, code: "E_FACTOR_LINK_INACTIVE" });
        }
        const expiresAt = (link.expires_at ?? link.document_expires_at) as Date | string | null;
        if (expiresAt !== null && new Date(expiresAt).getTime() < Date.now() && documentStatus !== "paid") {
            documentStatus = "expired";
            linkStatus = "expired";
        }
        if (!["active", "pending", "paid", "expired"].includes(linkStatus)) {
            throw new Exception("Payment link is not active", { status: 410, code: "E_FACTOR_LINK_INACTIVE" });
        }

        const gatewaysQuery = currentTrx()
            .from("payment_gateways")
            .where("enabled", true)
            .select("id", "code", "ordering")
            .orderBy("ordering", "asc")
            .orderBy("id", "asc");
        if (link.gateway_id !== null) {
            gatewaysQuery.where("id", toNumber(link.gateway_id as number | string));
        }
        const [items, gateways, factorSettings] = await Promise.all([
            currentTrx().from("order_document_items").where("document_id", documentId).orderBy("position", "asc"),
            gatewaysQuery,
            new SettingsService().all("factor"),
        ]);

        const publicCustomer = asJson(link.customer_snapshot);
        return {
            data: {
                code,
                reference: link.reference,
                status: documentStatus,
                link_status: linkStatus,
                customer: {
                    name: String(publicCustomer.name ?? ""),
                    company: publicCustomer.company ? String(publicCustomer.company) : null,
                },
                subtotal_minor: toNumber(link.subtotal_minor as number | string),
                line_discount_minor: toNumber(link.line_discount_minor as number | string),
                order_discount_minor: toNumber(link.order_discount_minor as number | string),
                shipping_minor: toNumber(link.shipping_minor as number | string),
                tax_minor: toNumber(link.tax_minor as number | string),
                rounding_minor: toNumber(link.rounding_minor as number | string),
                payable_minor: payableMinor,
                collected_minor: collectedMinor,
                outstanding_minor: Math.max(0, payableMinor - collectedMinor),
                currency_display: link.currency_display,
                customer_note: link.customer_note,
                expires_at: iso(expiresAt),
                gateway_id: link.gateway_id === null ? null : toNumber(link.gateway_id as number | string),
                gateway_code: link.gateway_code ?? null,
                gateways: (gateways as Array<{ id: number | string; code: string }>).map((gateway) => ({
                    id: toNumber(gateway.id),
                    code: gateway.code,
                    title: gateway.code.replaceAll("_", " ").toUpperCase(),
                    payment_mode: OFFLINE_GATEWAY_CODES.has(gateway.code) ? "offline_reconciliation" : "online",
                })),
                payment_instructions: {
                    account_title: typeof factorSettings.bank_account_title === "string" ? factorSettings.bank_account_title : "",
                    iban: typeof factorSettings.bank_iban === "string" ? factorSettings.bank_iban : "",
                    card_number: typeof factorSettings.bank_card_number === "string" ? factorSettings.bank_card_number : "",
                    footer_note: typeof factorSettings.footer_note === "string" ? factorSettings.footer_note : "",
                },
                items: (items as ItemRow[]).map(serializeItem),
            },
        };
    }

    async initPublicPayment(code: string, gatewayOverride: number | undefined, idempotencyKey: string | null) {
        if (!idempotencyKey || idempotencyKey.trim().length < 16 || idempotencyKey.length > 191) {
            throw new Exception("A stable Idempotency-Key header is required", {
                status: 422,
                code: "E_IDEMPOTENCY_KEY_REQUIRED",
            });
        }
        const link = await currentTrx()
            .from("payment_links as l")
            .join("order_documents as d", "d.id", "l.document_id")
            .where("l.code", code)
            .select(
                "l.*",
                "d.status as document_status",
                "d.payable_minor",
                "d.id as document_id",
                "d.version as document_version",
            )
            .forUpdate()
            .first();
        if (!link || !["active", "pending"].includes(String(link.status))) {
            throw new Exception("Payment link is not active", { status: 410, code: "E_FACTOR_LINK_INACTIVE" });
        }
        if (String(link.status) === "pending") {
            const replayedAttempt = await currentTrx()
                .from("payment_attempts")
                .where("order_id", link.order_id)
                .where("idempotency_key", idempotencyKey)
                .orderBy("created_at", "desc")
                .first();
            if (replayedAttempt && OFFLINE_GATEWAY_CODES.has(String(replayedAttempt.gateway_code_snapshot))) {
                return {
                    data: {
                        redirect_url: null,
                        attempt_id: Number(replayedAttempt.id),
                        offline_pending: true,
                        payment_status: "awaiting_reconciliation",
                    },
                };
            }
            throw new Exception("An offline payment is awaiting financial reconciliation", {
                status: 409,
                code: "E_FACTOR_OFFLINE_RECONCILIATION_PENDING",
            });
        }
        if (["paid", "cancelled", "expired", "refunded", "credited"].includes(String(link.document_status))) {
            await currentTrx()
                .from("payment_links")
                .where("id", link.id)
                .update({
                    status: String(link.document_status) === "expired" ? "expired" : "voided",
                    updated_at: nowSql(),
                });
            throw new Exception("Payment link is no longer payable", { status: 410, code: "E_FACTOR_LINK_INACTIVE" });
        }
        if (Number(link.max_uses ?? 1) > 0 && Number(link.used_count ?? 0) >= Number(link.max_uses ?? 1)) {
            throw new Exception("Payment link usage limit reached", { status: 410, code: "E_FACTOR_LINK_USED" });
        }
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
            await currentTrx().from("payment_links").where("id", link.id).update({ status: "expired", updated_at: nowSql() });
            throw new Exception("Payment link has expired", { status: 410, code: "E_FACTOR_LINK_EXPIRED" });
        }
        if (link.order_id === null) {
            throw new Exception("Payment order not found", { status: 409, code: "E_FACTOR_ORDER_MISSING" });
        }

        const documentId = toNumber(link.document_id as number | string);
        const collectedMinor = await this.collected(documentId);
        const payableMinor = toNumber(link.payable_minor as number | string);
        if (collectedMinor > 0) {
            throw new Exception("Online payment after a partial manual payment is not supported", {
                status: 409,
                code: "E_FACTOR_PARTIAL_PAYMENT_LINK_UNSUPPORTED",
            });
        }
        if (payableMinor > 0 && collectedMinor >= payableMinor) {
            await currentTrx()
                .from("payment_links")
                .where("id", link.id)
                .update({ status: "paid", used_count: 1, updated_at: nowSql() });
            throw new Exception("Document is already paid", { status: 409, code: "E_FACTOR_ALREADY_PAID" });
        }

        if (link.gateway_id !== null && gatewayOverride !== undefined && Number(link.gateway_id) !== gatewayOverride) {
            throw new Exception("This payment link is bound to a different gateway", {
                status: 422,
                code: "E_PAYMENT_GATEWAY_INVALID",
            });
        }
        const gatewayId = link.gateway_id === null ? gatewayOverride : Number(link.gateway_id);
        if (!gatewayId) throw new Exception("No payment gateway selected", { status: 422, code: "E_PAYMENT_REQUIRED" });
        const gateway = await currentTrx().from("payment_gateways").where("id", gatewayId).where("enabled", true).first();
        if (!gateway) throw new Exception("Payment gateway is unavailable", { status: 422, code: "E_PAYMENT_GATEWAY_INVALID" });

        const inFlightAttempt = await currentTrx()
            .from("payment_attempts")
            .where("order_id", link.order_id)
            .whereIn("status", ["initiated", "awaiting_callback"])
            .orderBy("created_at", "desc")
            .first();
        if (inFlightAttempt && String(inFlightAttempt.idempotency_key ?? "") !== idempotencyKey) {
            throw new Exception("Another online payment attempt is already in progress", {
                status: 409,
                code: "E_FACTOR_PAYMENT_IN_PROGRESS",
            });
        }

        const order = await Order.query().where("id", Number(link.order_id)).first();
        if (!order) throw new Exception("Payment order not found", { status: 404, code: "E_ORDER_NOT_FOUND" });
        order.paymentGatewayIdSnapshot = gatewayId;
        await order.save();

        const { paymentService } = await import("#services/payment_service");
        const result = await paymentService.init(order, gatewayId, idempotencyKey);
        const gatewayPayload = (result.attempt.gatewayPayload as Record<string, unknown> | null) ?? {};
        await currentTrx()
            .from("payment_attempts")
            .where("id", Number(result.attempt.id))
            .update({
                gateway_payload: JSON.stringify({
                    ...gatewayPayload,
                    factor_document_id: documentId,
                    factor_payment_link_id: toNumber(link.id as number | string),
                }),
            });

        const offlinePending = OFFLINE_GATEWAY_CODES.has(String(gateway.code));
        if (offlinePending) {
            const now = nowSql();
            await currentTrx().from("payment_links").where("id", link.id).update({
                status: "pending",
                used_count: 1,
                updated_at: now,
            });
            const documentUpdatedRows = await currentTrx()
                .from("order_documents")
                .where("id", documentId)
                .where("version", link.document_version)
                .update({
                    status: "awaiting",
                    version: Number(link.document_version) + 1,
                    updated_at: now,
                });
            if (Number(documentUpdatedRows) !== 1) {
                throw new Exception("Document was changed by another request", {
                    status: 409,
                    code: "E_FACTOR_VERSION_CONFLICT",
                });
            }
            await this.event(documentId, null, "payment.offline_pending", {
                attempt_id: Number(result.attempt.id),
                gateway_code: String(gateway.code),
            });
        } else if (String(result.attempt.status) === "verified") {
            await this.syncVerifiedPayment(
                Number(order.id),
                Number(result.attempt.id),
                result.attempt.gatewayTransactionId ?? null,
            );
        }
        return {
            data: {
                redirect_url: result.redirect_url,
                attempt_id: Number(result.attempt.id),
                offline_pending: offlinePending,
                payment_status: offlinePending ? "awaiting_reconciliation" : String(result.attempt.status),
            },
        };
    }

    async paymentAttempts(input: { page?: number; limit?: number; status?: string; q?: string }) {
        const page = input.page ?? 1;
        const limit = input.limit ?? 25;
        const base = currentTrx()
            .from("payment_attempts as pa")
            .joinRaw(
                `JOIN order_documents d ON d.id = COALESCE(
                    NULLIF(pa.gateway_payload->>'factor_document_id', '')::bigint,
                    (SELECT od.id FROM order_documents od
                      WHERE od.order_id = pa.order_id AND od.type IN ('invoice','proforma')
                      ORDER BY CASE WHEN od.type = 'invoice' THEN 0 ELSE 1 END, od.created_at DESC
                      LIMIT 1)
                )`,
            )
            .whereIn("d.type", ["proforma", "invoice"]);
        if (input.status) base.where("pa.status", input.status);
        if (input.q) {
            const needle = searchNeedle(input.q);
            base.where((query) => {
                query
                    .whereRaw(normalizedLikeSql("COALESCE(d.reference, '')"), [needle])
                    .orWhereRaw(normalizedLikeSql("COALESCE(pa.gateway_code_snapshot, '')"), [needle])
                    .orWhereRaw(normalizedLikeSql("COALESCE(pa.gateway_transaction_id, '')"), [needle]);
            });
        }
        const rowsQuery = base
            .clone()
            .select(
                "pa.id",
                "pa.order_id",
                "pa.gateway_id",
                "pa.gateway_code_snapshot as gateway_code",
                "pa.status",
                "pa.amount_minor",
                "pa.currency",
                "pa.gateway_authority",
                "pa.gateway_transaction_id",
                "pa.error_code",
                "pa.error_message",
                "pa.initiated_at",
                "pa.verified_at",
                "pa.created_at",
                "d.id as document_id",
                "d.reference as document_reference",
                "d.status as document_status",
            );
        const countQuery = base.clone().countDistinct("pa.id as total").first();
        const [rows, countRow] = await Promise.all([
            rowsQuery
                .orderBy("pa.created_at", "desc")
                .offset((page - 1) * limit)
                .limit(limit),
            countQuery,
        ]);
        const total = Number((countRow as { total?: number | string } | undefined)?.total ?? 0);
        return {
            data: (rows as Array<Record<string, unknown>>).map((row) => ({
                id: toNumber(row.id as number | string),
                order_id: toNumber(row.order_id as number | string),
                document_id: toNumber(row.document_id as number | string),
                document_reference: row.document_reference ?? null,
                document_status: String(row.document_status),
                gateway_id: toNumber(row.gateway_id as number | string),
                gateway_code: String(row.gateway_code),
                status: String(row.status),
                amount_minor: toNumber(row.amount_minor as number | string),
                currency: String(row.currency),
                gateway_authority: row.gateway_authority ?? null,
                gateway_transaction_id: row.gateway_transaction_id ?? null,
                error_code: row.error_code ?? null,
                error_message: row.error_message ?? null,
                initiated_at: iso((row.initiated_at as Date | string | null) ?? null),
                verified_at: iso((row.verified_at as Date | string | null) ?? null),
                created_at: iso((row.created_at as Date | string | null) ?? null),
            })),
            meta: { page, limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
        };
    }

    /** Mirrors a verified online-gateway attempt into the factor payment ledger exactly once. */
    async syncVerifiedPayment(orderId: number, attemptId: number, transactionId: string | null = null) {
        const attempt = await currentTrx()
            .from("payment_attempts")
            .where("id", attemptId)
            .where("order_id", orderId)
            .forUpdate()
            .first();
        if (!attempt || attempt.status !== "verified" || OFFLINE_GATEWAY_CODES.has(String(attempt.gateway_code_snapshot))) return;

        const payload = asJson(attempt.gateway_payload);
        const payloadDocumentId = Number(payload.factor_document_id ?? 0);
        const document =
            payloadDocumentId > 0
                ? await currentTrx()
                      .from("order_documents")
                      .where("id", payloadDocumentId)
                      .where("order_id", orderId)
                      .whereIn("type", ["proforma", "invoice"])
                      .forUpdate()
                      .first()
                : await currentTrx()
                      .from("order_documents")
                      .where("order_id", orderId)
                      .whereIn("type", ["proforma", "invoice"])
                      .orderByRaw("CASE WHEN type = 'invoice' THEN 0 ELSE 1 END")
                      .orderBy("created_at", "desc")
                      .forUpdate()
                      .first();
        if (!document) return;

        const payable = toNumber(document.payable_minor);
        const collectedBefore = await this.collected(Number(document.id));
        const attemptAmount = toNumber(attempt.amount_minor);
        if (attemptAmount > Math.max(0, payable - collectedBefore)) {
            throw new Exception("Verified payment exceeds the outstanding document balance", {
                status: 409,
                code: "E_FACTOR_GATEWAY_OVERPAYMENT",
            });
        }
        const now = nowSql();
        const inserted = await currentTrx()
            .table("factor_document_payments")
            .insert({
                tenant_id: currentTenantId(),
                document_id: document.id,
                payment_attempt_id: attempt.id,
                gateway_id: attempt.gateway_id,
                amount_minor: attemptAmount,
                method: "gateway",
                status: "paid",
                reference: transactionId || attempt.gateway_transaction_id || null,
                notes: null,
                paid_at: attempt.verified_at ?? now,
                created_by_user_id: null,
                attributes: JSON.stringify({ source: "gateway", gateway_code: attempt.gateway_code_snapshot }),
                created_at: now,
                updated_at: now,
            })
            .onConflict("payment_attempt_id")
            .ignore()
            .returning("id");
        if (inserted.length === 0) return;

        const collected = collectedBefore + attemptAmount;
        const status = collected >= payable ? "paid" : "awaiting";
        await currentTrx()
            .from("order_documents")
            .where("id", document.id)
            .update({
                status,
                paid_at: status === "paid" ? (attempt.verified_at ?? now) : document.paid_at,
                version: Number(document.version ?? 1) + 1,
                updated_at: now,
            });
        if (status === "paid") {
            await currentTrx()
                .from("payment_links")
                .where("document_id", document.id)
                .whereIn("status", ["active", "pending"])
                .update({
                    status: "paid",
                    used_count: 1,
                    updated_at: now,
                });
        }
        await this.event(Number(document.id), null, "payment.verified", {
            attempt_id: attemptId,
            amount_minor: attemptAmount,
            transaction_id: transactionId,
        });
    }

    private async collectedMap(documentIds: number[]): Promise<Map<number, number>> {
        const result = new Map<number, number>();
        if (documentIds.length === 0) return result;
        const rows = await currentTrx()
            .from("factor_document_payments")
            .whereIn("document_id", documentIds)
            .where("status", "paid")
            .groupBy("document_id")
            .select("document_id")
            .sum("amount_minor as total");
        for (const row of rows as Array<{ document_id: number | string; total: number | string }>) {
            result.set(toNumber(row.document_id), toNumber(row.total));
        }
        return result;
    }

    private async findOrFail(id: number): Promise<DocumentRow> {
        const row = (await currentTrx()
            .from("order_documents as d")
            .where("d.id", id)
            .whereIn("d.type", ["proforma", "invoice", "credit_note"])
            .select("d.*")
            .first()) as DocumentRow | undefined;
        if (!row) throw new Exception("Factor document not found", { status: 404, code: "E_NOT_FOUND" });
        row.collected_minor = await this.collected(id);
        for (const key of JSON_COLUMNS) {
            const parsed = asJson(row[key]);
            Object.assign(row, { [key]: parsed });
        }
        return row;
    }

    private assertExpectedVersion(row: DocumentRow, expectedVersion: number | undefined): void {
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion === undefined || expectedVersion < 1) {
            throw new Exception("expected_version is required", { status: 422, code: "E_FACTOR_VERSION_REQUIRED" });
        }
        if (Number(row.version) !== expectedVersion) {
            throw new Exception("Document was changed by another request", { status: 409, code: "E_FACTOR_VERSION_CONFLICT" });
        }
    }

    private async findForUpdate(id: number): Promise<DocumentRow> {
        const row = (await currentTrx()
            .from("order_documents as d")
            .where("d.id", id)
            .whereIn("d.type", ["proforma", "invoice", "credit_note"])
            .select("d.*")
            .forUpdate()
            .first()) as DocumentRow | undefined;
        if (!row) throw new Exception("Factor document not found", { status: 404, code: "E_NOT_FOUND" });
        row.collected_minor = await this.collected(id);
        for (const key of JSON_COLUMNS) Object.assign(row, { [key]: asJson(row[key]) });
        return row;
    }

    private async validateRelations(customerId: number | null, lines: FactorLineInput[]) {
        if (customerId !== null) {
            const customer = await currentTrx().from("customers").where("id", customerId).whereNull("deleted_at").first();
            if (!customer) throw new Exception("Customer not found", { status: 422, code: "E_CUSTOMER_NOT_FOUND" });
        }
        const productIds = [
            ...new Set(lines.map((line) => line.product_id).filter((value): value is number => typeof value === "number")),
        ];
        if (productIds.length > 0) {
            const rows = await currentTrx()
                .from("products")
                .whereIn("id", productIds)
                .where("status", "publish")
                .whereNull("deleted_at")
                .select("id");
            const found = new Set(rows.map((row) => Number(row.id)));
            const missing = productIds.find((id) => !found.has(id));
            if (missing !== undefined) {
                throw new Exception(`Product ${missing} is unavailable`, { status: 422, code: "E_PRODUCT_NOT_FOUND" });
            }
        }
        const variations = lines
            .filter((line): line is FactorLineInput & { variation_id: number } => typeof line.variation_id === "number")
            .map((line) => ({ variationId: line.variation_id, productId: line.product_id ?? null }));
        if (variations.length > 0) {
            const ids = [...new Set(variations.map((item) => item.variationId))];
            const rows = await currentTrx()
                .from("product_variations")
                .whereIn("id", ids)
                .whereNull("deleted_at")
                .where("status", "active")
                .select("id", "product_id");
            const found = new Map(rows.map((row) => [Number(row.id), Number(row.product_id)]));
            for (const variation of variations) {
                const ownerProductId = found.get(variation.variationId);
                if (ownerProductId === undefined || variation.productId === null || ownerProductId !== variation.productId) {
                    throw new Exception(`Variation ${variation.variationId} does not belong to the selected product`, {
                        status: 422,
                        code: "E_VARIATION_PRODUCT_MISMATCH",
                    });
                }
            }
        }
    }

    private async lockedBackingOrder(orderId: number): Promise<Order> {
        const order = await Order.query().where("id", orderId).forUpdate().first();
        if (!order) throw new Exception("Backing order not found", { status: 409, code: "E_FACTOR_ORDER_MISSING" });
        return order;
    }

    private async ensureBackingOrderPending(orderId: number, reason: string): Promise<Order> {
        const order = await this.lockedBackingOrder(orderId);
        if (
            order.status === OrderStatus.Pending ||
            order.status === OrderStatus.OnHold ||
            order.status === OrderStatus.Processing
        ) {
            return order;
        }
        if (order.status === OrderStatus.Draft || order.status === OrderStatus.Failed) {
            await orderStateMachine.transition(order, OrderStatus.Pending, { reason, trx: currentTrx() });
            return order;
        }
        throw new Exception(`Backing order cannot accept payment from status ${order.status}`, {
            status: 409,
            code: "E_FACTOR_ORDER_STATE",
        });
    }

    private async moveBackingOrderToOnHold(orderId: number, reason: string): Promise<void> {
        const order = await this.ensureBackingOrderPending(orderId, reason);
        if (order.status === OrderStatus.Pending) {
            await orderStateMachine.transition(order, OrderStatus.OnHold, { reason, trx: currentTrx() });
        }
    }

    private async moveBackingOrderToProcessing(orderId: number, reason: string): Promise<void> {
        const order = await this.ensureBackingOrderPending(orderId, reason);
        if (order.status === OrderStatus.Pending || order.status === OrderStatus.OnHold) {
            await orderStateMachine.transition(order, OrderStatus.Processing, { reason, trx: currentTrx() });
        }
    }

    private async cancelBackingOrder(orderId: number, reason: string): Promise<void> {
        const order = await this.lockedBackingOrder(orderId);
        if (order.status === OrderStatus.Cancelled || order.status === OrderStatus.Refunded) return;
        if ([OrderStatus.Draft, OrderStatus.Pending, OrderStatus.OnHold, OrderStatus.Processing].includes(order.status)) {
            await orderStateMachine.transition(order, OrderStatus.Cancelled, { reason, trx: currentTrx() });
        }
    }

    private async createBackingOrder(
        input: FactorDocumentInput,
        money: ReturnType<typeof calculateFactorMoney>,
        config: { currency: string; currencyDisplay: string },
    ): Promise<number> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const now = nowSql();
        const orderNumber = await nextNumber("order");
        const orderStatus = OrderStatus.Draft;
        const [inserted] = await trx
            .table("orders")
            .insert({
                tenant_id: tenantId,
                order_number: orderNumber,
                order_key: orderKey(),
                status: orderStatus,
                customer_id: input.customer_id ?? null,
                currency: config.currency,
                currency_display: config.currencyDisplay,
                prices_include_tax: false,
                created_via: "factor",
                billing_email: input.customer.email ?? null,
                customer_note: input.customer_note ?? null,
                items_total: money.subtotalMinor,
                items_tax_total: money.taxMinor - money.shippingTaxMinor,
                shipping_total: money.shippingMinor,
                shipping_tax_total: money.shippingTaxMinor,
                fees_total: money.roundingMinor,
                fees_tax_total: 0,
                discount_total: money.lineDiscountMinor + money.orderDiscountMinor,
                discount_tax_total: 0,
                tax_total: money.taxMinor,
                grand_total: money.payableMinor,
                attributes: JSON.stringify({ source: "factor", customer_snapshot: input.customer }),
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        const orderId = Number((inserted as { id: number | string }).id);
        await this.replaceOrderItems(orderId, input.lines, money, now);
        await this.replaceOrderAuxiliaryLines(orderId, money, input.tax_percent ?? 0, now);
        return orderId;
    }

    private async syncBackingOrder(orderId: number, input: FactorDocumentInput, money: ReturnType<typeof calculateFactorMoney>) {
        const now = nowSql();
        await currentTrx()
            .from("orders")
            .where("id", orderId)
            .update({
                customer_id: input.customer_id ?? null,
                billing_email: input.customer.email ?? null,
                customer_note: input.customer_note ?? null,
                items_total: money.subtotalMinor,
                items_tax_total: money.taxMinor - money.shippingTaxMinor,
                shipping_total: money.shippingMinor,
                shipping_tax_total: money.shippingTaxMinor,
                fees_total: money.roundingMinor,
                fees_tax_total: 0,
                discount_total: money.lineDiscountMinor + money.orderDiscountMinor,
                discount_tax_total: 0,
                tax_total: money.taxMinor,
                grand_total: money.payableMinor,
                updated_at: now,
            });
        await currentTrx().from("order_line_items").where("order_id", orderId).delete();
        await this.replaceOrderItems(orderId, input.lines, money, now);
        await this.replaceOrderAuxiliaryLines(orderId, money, input.tax_percent ?? 0, now);
    }

    private async replaceOrderItems(
        orderId: number,
        lines: FactorLineInput[],
        money: ReturnType<typeof calculateFactorMoney>,
        now: string,
    ) {
        const tenantId = currentTenantId();
        if (lines.length === 0) return;
        await currentTrx()
            .table("order_line_items")
            .insert(
                lines.map((line, index) => ({
                    tenant_id: tenantId,
                    order_id: orderId,
                    product_id: line.product_id ?? null,
                    variation_id: line.variation_id ?? null,
                    name_snapshot: line.name,
                    sku_snapshot: line.sku ?? null,
                    quantity: line.quantity,
                    price_snapshot: line.unit_price_minor,
                    subtotal: money.lines[index]!.grossMinor,
                    subtotal_tax: money.lines[index]!.taxMinor,
                    total: money.lines[index]!.taxableMinor,
                    total_tax: money.lines[index]!.taxMinor,
                    tax_class_id_snapshot: null,
                    attributes_snapshot: JSON.stringify({ source: "factor", description: line.description ?? null }),
                    created_at: now,
                    updated_at: now,
                })),
            );
    }

    private async replaceOrderAuxiliaryLines(
        orderId: number,
        money: ReturnType<typeof calculateFactorMoney>,
        taxPercent: number,
        now: string,
    ) {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        await Promise.all([
            trx.from("order_shipping_lines").where("order_id", orderId).delete(),
            trx.from("order_coupon_lines").where("order_id", orderId).delete(),
            trx.from("order_tax_lines").where("order_id", orderId).delete(),
            trx.from("order_fee_lines").where("order_id", orderId).delete(),
        ]);
        if (money.shippingMinor > 0 || money.shippingTaxMinor > 0) {
            await trx.table("order_shipping_lines").insert({
                tenant_id: tenantId,
                order_id: orderId,
                method_id_snapshot: null,
                instance_id_snapshot: null,
                method_code_snapshot: "factor_manual_shipping",
                title_snapshot: "هزینه ارسال سند",
                total: money.shippingMinor,
                total_tax: money.shippingTaxMinor,
                attributes: JSON.stringify({ source: "factor" }),
                created_at: now,
                updated_at: now,
            });
        }
        const totalDiscountMinor = money.lineDiscountMinor + money.orderDiscountMinor;
        if (totalDiscountMinor > 0) {
            await trx.table("order_coupon_lines").insert({
                tenant_id: tenantId,
                order_id: orderId,
                coupon_id: null,
                code_snapshot: "FACTOR-DISCOUNT",
                discount: totalDiscountMinor,
                discount_tax: 0,
                created_at: now,
                updated_at: now,
            });
        }
        if (money.taxMinor > 0) {
            await trx.table("order_tax_lines").insert({
                tenant_id: tenantId,
                order_id: orderId,
                tax_rate_id_snapshot: null,
                rate_code_snapshot: "FACTOR-TAX",
                label_snapshot: "مالیات سند",
                rate_percent_snapshot: taxPercent,
                compound_snapshot: false,
                tax_total: money.taxMinor - money.shippingTaxMinor,
                shipping_tax_total: money.shippingTaxMinor,
                created_at: now,
                updated_at: now,
            });
        }
        if (money.roundingMinor !== 0) {
            await trx.table("order_fee_lines").insert({
                tenant_id: tenantId,
                order_id: orderId,
                name_snapshot: "تعدیل گردکردن سند",
                tax_class_id_snapshot: null,
                taxable: false,
                total: money.roundingMinor,
                total_tax: 0,
                created_at: now,
                updated_at: now,
            });
        }
    }

    private async replaceItems(
        documentId: number,
        lines: FactorLineInput[],
        money: ReturnType<typeof calculateFactorMoney>,
        taxPercent: number,
        now: string,
    ) {
        await currentTrx().from("order_document_items").where("document_id", documentId).delete();
        const tenantId = currentTenantId();
        await currentTrx()
            .table("order_document_items")
            .insert(
                lines.map((line, index) => ({
                    tenant_id: tenantId,
                    document_id: documentId,
                    product_id: line.product_id ?? null,
                    variation_id: line.variation_id ?? null,
                    sku_snapshot: line.sku ?? null,
                    name_snapshot: line.name,
                    description_snapshot: line.description ?? null,
                    quantity: line.quantity,
                    unit_price_minor: line.unit_price_minor,
                    discount_percent: line.discount_percent ?? 0,
                    discount_minor: money.lines[index]!.discountMinor,
                    tax_percent: taxPercent,
                    tax_minor: money.lines[index]!.taxMinor,
                    line_total_minor: money.lines[index]!.netMinor,
                    position: index,
                    attributes: JSON.stringify({}),
                    created_at: now,
                    updated_at: now,
                })),
            );
    }

    private async event(documentId: number, actorUserId: number | null, eventType: string, metadata: Record<string, unknown>) {
        await currentTrx()
            .table("order_document_events")
            .insert({
                tenant_id: currentTenantId(),
                document_id: documentId,
                actor_user_id: actorUserId,
                event_type: eventType,
                metadata: JSON.stringify(metadata),
                created_at: nowSql(),
            });
    }

    private async collected(documentId: number): Promise<number> {
        const row = await currentTrx()
            .from("factor_document_payments")
            .where("document_id", documentId)
            .where("status", "paid")
            .sum("amount_minor as total")
            .first();
        return Number(row?.total ?? 0);
    }
}

export const factorDocumentService = new FactorDocumentService();
