import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import type Cart from "#models/cart";
import CartItem from "#models/cart_item";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { buildCartView, resolveCustomerContext } from "#services/cart_view_builder";
import { defaultValidationContext, rulesFor } from "#services/country_address_rules/index";
import { resolvePrice } from "#services/price_resolver";
import { findEligibleRate } from "#services/shipping_rate_service";
import { currentTrx, withTenantTransaction } from "#services/tenant_context";
import CartTransformer from "#transformers/cart_transformer";
import {
    addItemValidator,
    selectShippingRateValidator,
    updateCustomerValidator,
    updateItemValidator,
} from "#validators/cart/cart_validator";

/**
 * Single resource controller for `/api/v1/cart/*`. Every action returns the same
 * `{data: cart-envelope}` shape — the {@link CartTransformer} owns the serialization and the
 * controller methods are thin orchestrators around the mutation + recomputation flow.
 *
 * The cart is materialized by `cart_middleware` on every request and reachable as `ctx.cart`. The
 * controller never has to load it again; the only DB writes touch `cart_items` and the cart's
 * derived address fields.
 */
export default class CartController {
    async show(ctx: HttpContext) {
        return this.respond(ctx);
    }

    /**
     * `POST /api/v1/cart/items`. Adds (or increments) a line. Two concurrent calls with the same
     * (product, variation) tuple cannot race: the partial UNIQUE index on cart_items keeps the
     * second INSERT from succeeding, and the wrapping transaction with `SELECT … FOR UPDATE` on the
     * cart row serializes the increment path. Net effect: one row, summed quantity.
     */
    async addItem(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(addItemValidator);
        const cart = ctx.cart;

        const { product, variation } = await this.loadProductAndVariation(payload.product_id, payload.variation_id ?? null);
        await this.assertInStock(product, variation);
        const requestedQuantity = product.soldIndividually ? Math.min(payload.quantity, 1) : payload.quantity;
        const priceSnapshot = this.resolveCurrentPrice(product, variation);

        await withTenantTransaction(async (trx) => {
            await trx.from("carts").where("id", Number(cart.id)).forUpdate().first();

            const existing = await CartItem.query({ client: trx })
                .where("cart_id", Number(cart.id))
                .where("product_id", Number(product.id))
                .where((q) => {
                    if (variation === null) q.whereNull("variation_id");
                    else q.where("variation_id", Number(variation.id));
                })
                .forUpdate()
                .first();

            if (existing) {
                const sum = existing.quantity + requestedQuantity;
                existing.quantity = product.soldIndividually ? Math.min(sum, 1) : sum;
                existing.useTransaction(trx);
                await existing.save();
                return;
            }

            await CartItem.create(
                {
                    cartId: cart.id,
                    productId: product.id,
                    variationId: variation === null ? null : variation.id,
                    quantity: requestedQuantity,
                    priceSnapshot,
                    attributesSnapshot: {},
                },
                { client: trx },
            );
        });

        return this.respond(ctx);
    }

    async updateItem(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(updateItemValidator);
        const line = await this.findOwnedLine(ctx.cart, ctx.params.line_id);

        if (payload.quantity === 0) {
            await line.delete();
            return this.respond(ctx);
        }

        const product = await Product.find(line.productId);
        if (!product) throw new Exception("Cart line references a missing product", { status: 422, code: "E_PRODUCT_MISSING" });
        const variation = line.variationId === null ? null : await ProductVariation.find(line.variationId);

        await this.assertInStock(product, variation);
        const next = product.soldIndividually ? Math.min(payload.quantity, 1) : payload.quantity;
        line.quantity = next;
        await line.save();

        return this.respond(ctx);
    }

    async removeItem(ctx: HttpContext) {
        const line = await this.findOwnedLine(ctx.cart, ctx.params.line_id);
        await line.delete();
        return this.respond(ctx);
    }

    async clear(ctx: HttpContext) {
        await CartItem.query().where("cart_id", Number(ctx.cart.id)).delete();
        ctx.cart.shippingZoneMethodId = null;
        await ctx.cart.save();
        return this.respond(ctx);
    }

    /**
     * `POST /api/v1/cart/customer`. Updates the address fields the cart uses for tax + shipping
     * calc only — never touches `customer_addresses`. Country rules drive postcode validation +
     * region requirement (Pattern 2); unknown countries fall through to the permissive defaults.
     */
    async updateCustomer(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(updateCustomerValidator);
        const country = payload.country.toUpperCase();
        const rules = rulesFor(country);

        if (payload.postcode && rules.postcodePattern && !rules.postcodePattern.test(payload.postcode)) {
            throw this.validationError("postcode", "format", `postcode does not match ${country} format`);
        }

        if (rules.requiresRegion && !payload.region_id && !payload.region_text) {
            throw this.validationError("region_id", "required", `region required for ${country}`);
        }

        if (payload.region_id && rules.validateRegion) {
            const ok = await rules.validateRegion(payload.region_id, defaultValidationContext);
            if (!ok) {
                throw this.validationError("region_id", "country_mismatch", `region does not belong to ${country}`);
            }
        }

        const cart = ctx.cart;
        const previousAddressKey = this.addressKey(cart);
        cart.country = country;
        cart.regionId = payload.region_id ?? null;
        cart.postcode = payload.postcode ?? null;
        /** Switching address invalidates the previously-selected shipping rate (it may not be in the new zone). */
        if (previousAddressKey !== this.addressKey(cart)) {
            cart.shippingZoneMethodId = null;
        }
        await cart.save();

        return this.respond(ctx);
    }

    async selectShippingRate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(selectShippingRateValidator);
        const cart = ctx.cart;
        if (!cart.country) {
            throw this.validationError("country", "required", "set the cart address before picking a shipping rate");
        }

        const itemsTotal = await this.computeItemsTotalGross(cart);
        const eligible = await findEligibleRate(
            {
                country: cart.country,
                regionId: cart.regionId === null ? null : Number(cart.regionId),
                postcode: cart.postcode,
            },
            payload.shipping_zone_method_id,
            itemsTotal,
        );
        if (!eligible) {
            throw this.validationError(
                "shipping_zone_method_id",
                "ineligible",
                "shipping method is not eligible for the cart's current address",
            );
        }

        cart.shippingZoneMethodId = eligible.id;
        await cart.save();
        return this.respond(ctx);
    }

    private async loadProductAndVariation(
        productId: number,
        variationId: number | null,
    ): Promise<{ product: Product; variation: ProductVariation | null }> {
        const product = await Product.query().where("id", productId).whereNull("deleted_at").where("status", "publish").first();
        if (!product) throw new Exception("Product not available", { status: 422, code: "E_PRODUCT_UNAVAILABLE" });

        let variation: ProductVariation | null = null;
        if (variationId !== null) {
            variation = await ProductVariation.query()
                .where("id", variationId)
                .where("product_id", Number(product.id))
                .whereNull("deleted_at")
                .first();
            if (!variation) {
                throw new Exception("Variation does not belong to product", {
                    status: 422,
                    code: "E_VARIATION_MISMATCH",
                });
            }
        } else if (product.type === "variable") {
            throw new Exception("Variable products require a variation_id", {
                status: 422,
                code: "E_VARIATION_REQUIRED",
            });
        }

        return { product, variation };
    }

    private async assertInStock(product: Product, variation: ProductVariation | null): Promise<void> {
        const inventoryItem = await currentTrx()
            .from("inventory_items")
            .where("product_id", Number(product.id))
            .where((q) => {
                if (variation === null) q.whereNull("variation_id");
                else q.where("variation_id", Number(variation.id));
            })
            .first();
        /**
         * Absence of an `inventory_items` row means the product is unmanaged (e.g. virtual /
         * downloadable / on-demand). Adopt the Woo semantic: unmanaged → always in stock.
         */
        if (!inventoryItem) return;
        if (inventoryItem.stock_status === "outofstock") {
            throw new Exception("Product is out of stock", { status: 422, code: "E_OUT_OF_STOCK" });
        }
    }

    private resolveCurrentPrice(product: Product, variation: ProductVariation | null): number {
        const resolved = resolvePrice(product, variation);
        if (resolved.effectivePrice === null || resolved.effectivePrice === undefined) {
            throw new Exception("Product has no price configured", {
                status: 422,
                code: "E_PRODUCT_PRICELESS",
            });
        }
        return Number(resolved.effectivePrice);
    }

    private async findOwnedLine(cart: Cart, idParam: unknown): Promise<CartItem> {
        const numericId = Number(idParam);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Cart line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const line = await CartItem.query().where("id", numericId).where("cart_id", Number(cart.id)).first();
        if (!line) {
            throw new Exception("Cart line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return line;
    }

    private addressKey(cart: Cart): string {
        return `${cart.country ?? ""}|${cart.regionId ?? ""}|${cart.postcode ?? ""}`;
    }

    private async computeItemsTotalGross(cart: Cart): Promise<number> {
        const rows = await currentTrx()
            .from("cart_items")
            .where("cart_id", Number(cart.id))
            .select(db.raw("COALESCE(SUM(price_snapshot * quantity), 0)::bigint as total"));
        const total = rows[0]?.total ?? 0;
        return typeof total === "bigint" ? Number(total) : Number(total);
    }

    /**
     * Assemble + serialize the full cart envelope. Called from every controller action so the
     * response shape is contract-stable: GET, POST, PATCH, DELETE all return the same body. The
     * envelope is reassembled rather than cached so totals always reflect the post-mutation state.
     */
    private async respond(ctx: HttpContext) {
        const customer = await resolveCustomerContext(ctx);
        const view = await buildCartView(ctx.cart, ctx.i18n.locale, customer);
        return { data: new CartTransformer(view).toObject() };
    }

    private validationError(field: string, rule: string, message: string): Exception {
        const error = new Exception(message, { status: 422, code: "E_VALIDATION_ERROR" });
        Object.defineProperty(error, "messages", {
            value: [{ field, rule, message }],
        });
        return error;
    }
}
