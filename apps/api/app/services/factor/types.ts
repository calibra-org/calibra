export interface FactorCustomerSnapshot {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    national_id: string | null;
}

export interface FactorLineInput {
    product_id?: number | null;
    variation_id?: number | null;
    sku?: string | null;
    name: string;
    description?: string | null;
    quantity: number;
    unit_price_minor: number;
    discount_percent?: number;
}

export interface FactorDocumentInput {
    type: "proforma" | "invoice";
    customer_id?: number | null;
    customer: {
        name: string;
        email?: string | null;
        phone?: string | null;
        company?: string | null;
        national_id?: string | null;
    };
    lines: FactorLineInput[];
    order_discount_minor?: number;
    shipping_minor?: number;
    tax_percent?: number;
    round_to_minor?: number;
    customer_note?: string | null;
    internal_note?: string | null;
    due_at?: string | null;
    expires_at?: string | null;
    delivery_channel?: "none" | "sms" | "email" | "whatsapp";
    status?: "draft" | "sent";
    expected_version?: number;
}
