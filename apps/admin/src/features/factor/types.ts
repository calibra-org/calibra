export type FactorType = "proforma" | "invoice" | "credit_note";
export type FactorStatus = "draft" | "sent" | "viewed" | "awaiting" | "paid" | "expired" | "cancelled" | "refunded" | "credited";

export interface FactorCustomerSnapshot {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    national_id: string | null;
}

export interface FactorLine {
    id?: number;
    product_id: number | null;
    variation_id: number | null;
    sku: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unit_price_minor: number;
    discount_percent: number;
    discount_minor?: number;
    tax_percent?: number;
    tax_minor?: number;
    line_total_minor?: number;
    position?: number;
}

export interface FactorPayment {
    id: number;
    amount_minor: number;
    method: string;
    status: string;
    reference: string | null;
    notes: string | null;
    gateway_code: string | null;
    paid_at: string | null;
    created_at: string;
}

export interface FactorEvent {
    id: number;
    event_type: string;
    actor_user_id: number | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface FactorPaymentLink {
    id: number;
    code: string;
    status: string;
    gateway_id: number | null;
    amount_minor: number;
    expires_at: string | null;
    used_count: number;
    created_at: string;
}

export interface FactorDocument {
    id: number;
    order_id: number | null;
    customer_id: number | null;
    parent_document_id: number | null;
    type: FactorType;
    number: number | null;
    reference: string | null;
    locale: string;
    currency: string;
    currency_display: string;
    amount_minor: number;
    status: FactorStatus;
    delivery_channel: "none" | "sms" | "email" | "whatsapp";
    customer: FactorCustomerSnapshot;
    billing: FactorCustomerSnapshot;
    subtotal_minor: number;
    line_discount_minor: number;
    order_discount_minor: number;
    shipping_minor: number;
    tax_minor: number;
    rounding_minor: number;
    round_to_minor: number;
    payable_minor: number;
    collected_minor: number;
    outstanding_minor: number;
    tax_percent: number;
    customer_note: string | null;
    internal_note: string | null;
    due_at: string | null;
    expires_at: string | null;
    sent_at: string | null;
    viewed_at: string | null;
    paid_at: string | null;
    cancelled_at: string | null;
    issued_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
    attributes: Record<string, unknown>;
    items?: FactorLine[];
    events?: FactorEvent[];
    payments?: FactorPayment[];
    payment_links?: FactorPaymentLink[];
    child_documents?: Array<{
        id: number;
        type: FactorType;
        status: FactorStatus;
        reference: string | null;
        created_at: string;
    }>;
}

export interface FactorDocumentInput {
    type: "proforma" | "invoice";
    customer_id: number | null;
    customer: {
        name: string;
        email: string | null;
        phone: string | null;
        company: string | null;
        national_id: string | null;
    };
    lines: Array<{
        product_id: number | null;
        variation_id: number | null;
        sku: string | null;
        name: string;
        description: string | null;
        quantity: number;
        unit_price_minor: number;
        discount_percent: number;
    }>;
    order_discount_minor: number;
    shipping_minor: number;
    tax_percent: number;
    round_to_minor: number;
    customer_note: string | null;
    internal_note: string | null;
    due_at: string | null;
    expires_at: string | null;
    delivery_channel: "none" | "sms" | "email" | "whatsapp";
    status?: "draft" | "sent";
    expected_version?: number;
}

export type FactorDocumentUpdateInput = Omit<FactorDocumentInput, "status" | "expected_version"> & { expected_version: number };

export interface FactorSummary {
    statuses: Record<string, { count: number; amount_minor: number }>;
    total_documents: number;
    gross_invoiced_minor: number;
    credited_minor: number;
    total_issued_minor: number;
    collected_minor: number;
    outstanding_minor: number;
    overdue_count: number;
    overdue_minor: number;
}

export interface FactorSettings {
    reference_prefix: string;
    default_type: "proforma" | "invoice";
    default_tax_percent: number;
    default_expiry_days: number;
    round_to_minor: number;
    default_delivery_channel: "none" | "sms" | "email" | "whatsapp";
    bank_account_title: string;
    bank_iban: string;
    bank_card_number: string;
    footer_note: string;
}

export interface FactorReports {
    monthly: Array<{ bucket: string; documents: number; issued_minor: number; paid_minor: number }>;
    aging: Array<{ bucket: string; count: number; amount_minor: number }>;
    channels: Array<{ delivery_channel: string; count: number; amount_minor: number }>;
    gateways: Array<{ gateway: string; count: number; amount_minor: number }>;
}

export interface FactorCustomerResource {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    national_id: string | null;
}

export interface FactorProductResource {
    id: number;
    variation_id: number | null;
    name: string;
    sku: string | null;
    unit_price_minor: number;
}
