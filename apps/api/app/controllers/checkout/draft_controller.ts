import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderAddressIranExtension from "#models/order_address_iran_extension";
import PaymentGateway from "#models/payment_gateway";
import { throwIfErrors, validateAddressForCountry } from "#services/address_country_validator";
import { orderFactory } from "#services/order_factory";
import OrderTransformer from "#transformers/order_transformer";
import { checkoutDraftValidator } from "#validators/checkout/draft_validator";

/**
 * Storefront checkout controller for `GET /api/v1/checkout` and `PUT /api/v1/checkout`. The
 * `cart_middleware` already resolves `ctx.cart`. The draft order is materialized lazily — first
 * GET creates one, second GET returns the same row, PUT patches addresses + payment + note onto
 * it.
 */
export default class CheckoutDraftController {
    async show(ctx: HttpContext) {
        const cart = ctx.cart;
        const order = await this.materializeDraft(cart, ctx.i18n.locale);
        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forDetail() };
    }

    async update(ctx: HttpContext) {
        const cart = ctx.cart;
        const order = await this.materializeDraft(cart, ctx.i18n.locale);
        const payload = await ctx.request.validateUsing(checkoutDraftValidator);

        await db.transaction(async (trx) => {
            order.useTransaction(trx);
            if (payload.billing_address) {
                await this.persistAddress(order, "billing", payload.billing_address, payload.billing_iran_extension ?? null);
            }
            if (payload.shipping_address) {
                await this.persistAddress(order, "shipping", payload.shipping_address, payload.shipping_iran_extension ?? null);
            }
            if (payload.payment_gateway_id !== undefined) {
                const gateway = await PaymentGateway.find(payload.payment_gateway_id, { client: trx });
                if (!gateway?.enabled) {
                    throw new Exception("Payment method is unavailable", {
                        status: 422,
                        code: "E_PAYMENT_GATEWAY_INVALID",
                    });
                }
                order.paymentGatewayIdSnapshot = gateway.id;
                order.paymentMethodCodeSnapshot = gateway.code;
                order.paymentMethodTitleSnapshot = gateway.code;
            }
            if (payload.customer_note !== undefined) {
                order.customerNote = payload.customer_note ?? null;
            }
            await order.save();
        });

        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forDetail() };
    }

    /**
     * Either return an existing draft attached to this customer (or cart), or build one from the
     * current cart via {@link OrderFactory}. The draft is keyed on the cart's `customer_id` when
     * the user is authenticated; otherwise on `cart_hash = cart.id`.
     */
    private async materializeDraft(cart: Cart, locale: string): Promise<Order> {
        const existing = await this.findExistingDraft(cart);
        if (existing) return existing;
        return orderFactory.fromCart(cart, { locale });
    }

    private async findExistingDraft(cart: Cart): Promise<Order | null> {
        if (cart.customerId !== null) {
            const own = await Order.query()
                .where("customer_id", Number(cart.customerId))
                .where("status", OrderStatus.Draft)
                .orderBy("id", "desc")
                .first();
            if (own) return own;
        }
        return Order.query().where("cart_hash", String(cart.id)).where("status", OrderStatus.Draft).orderBy("id", "desc").first();
    }

    private async persistAddress(
        order: Order,
        kind: "billing" | "shipping",
        payload: {
            first_name: string;
            last_name: string;
            company?: string | null;
            address_line_1: string;
            address_line_2?: string | null;
            city: string;
            region_id?: number | null;
            region_text?: string | null;
            postcode?: string | null;
            country: string;
            phone?: string | null;
            email?: string | null;
        },
        iranExt: {
            national_id?: string | null;
            corporate_national_id?: string | null;
            economic_code?: string | null;
            legal_company_name_fa?: string | null;
        } | null,
    ): Promise<void> {
        const country = payload.country.toUpperCase();
        const errors = await validateAddressForCountry({
            first_name: payload.first_name,
            last_name: payload.last_name,
            address_line_1: payload.address_line_1,
            city: payload.city,
            region_id: payload.region_id ?? null,
            region_text: payload.region_text ?? null,
            postcode: payload.postcode ?? null,
            country,
            phone: payload.phone ?? null,
            iran_extension: iranExt ?? null,
        });
        throwIfErrors(errors);

        const existing = await OrderAddress.query().where("order_id", Number(order.id)).where("kind", kind).first();
        const row = existing ?? new OrderAddress();
        row.orderId = order.id;
        row.kind = kind;
        row.firstName = payload.first_name;
        row.lastName = payload.last_name;
        row.company = payload.company ?? null;
        row.addressLine1 = payload.address_line_1;
        row.addressLine2 = payload.address_line_2 ?? null;
        row.city = payload.city;
        row.regionId = payload.region_id ?? null;
        row.regionText = payload.region_text ?? null;
        row.postcode = payload.postcode ?? null;
        row.country = country;
        row.phone = payload.phone ?? null;
        row.email = payload.email ?? null;
        row.attributes = row.attributes ?? {};
        await row.save();

        if (country === "IR" && iranExt && Object.values(iranExt).some((v) => v)) {
            await OrderAddressIranExtension.updateOrCreate(
                { orderAddressId: row.id },
                {
                    orderAddressId: row.id,
                    nationalId: iranExt.national_id ?? null,
                    corporateNationalId: iranExt.corporate_national_id ?? null,
                    economicCode: iranExt.economic_code ?? null,
                    legalCompanyNameFa: iranExt.legal_company_name_fa ?? null,
                },
            );
        } else if (country !== "IR") {
            await OrderAddressIranExtension.query().where("order_address_id", Number(row.id)).delete();
        }

        if (kind === "billing" && payload.email) {
            order.billingEmail = payload.email;
        }
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
    }
}
