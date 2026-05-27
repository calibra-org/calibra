import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";

import Customer from "#models/customer";
import CustomerTag from "#models/customer_tag";
import { adminCustomerTagsView, type AdminCustomerTagsViewQuery } from "#table_views/admin/customer_tags";
import CustomerTagTransformer from "#transformers/customer_tag_transformer";
import { adminCustomerTagAttachValidator, adminCustomerTagCreateValidator } from "#validators/admin/customer_validator";

const TAG_NAME_RE = /^[a-z0-9._-]{1,40}$/;

const adminCustomerTagsListValidator = vine.compile(
    vine.object({
        ...adminCustomerTagsView.schema.getProperties(),
        q: vine.string().trim().minLength(1).maxLength(40).optional(),
    }),
);

/**
 * Tag names are normalized to lowercase + a strict character set before they hit the DB so
 * `VIP`, `vip`, and ` vip ` all collapse to the same row. The combobox UI shows tags exactly as
 * stored, which is what we want — admins see the canonical form.
 */
function normalizeTagName(raw: string): string {
    const cleaned = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!TAG_NAME_RE.test(cleaned)) {
        throw new Exception(`Tag name must match ${TAG_NAME_RE}`, { status: 422, code: "E_VALIDATION_ERROR" });
    }
    return cleaned;
}

export default class AdminCustomerTagsController {
    /** GET /api/v1/admin/customer-tags — paginated; `?q=` does prefix search for the autocomplete combobox. */
    async index(ctx: HttpContext) {
        const payload = (await adminCustomerTagsListValidator.validate(ctx.request.qs())) as AdminCustomerTagsViewQuery & {
            q?: string;
        };
        const q = (payload.q ?? "").toLowerCase();
        const builder = CustomerTag.query();
        if (q.length > 0) builder.where("name", "like", `${q}%`);

        const { data, meta } = await adminCustomerTagsView.run<CustomerTag>(builder, payload);
        return {
            data: data.map((t) => new CustomerTagTransformer(t).toObject()),
            meta,
        };
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerTagCreateValidator);
        const name = normalizeTagName(payload.name);
        const existing = await CustomerTag.findBy("name", name);
        if (existing) {
            return { data: new CustomerTagTransformer(existing).toObject() };
        }
        const tag = await CustomerTag.create({ name });
        ctx.response.status(201);
        return { data: new CustomerTagTransformer(tag).toObject() };
    }

    async destroy(ctx: HttpContext) {
        const tag = await CustomerTag.find(ctx.params.id);
        if (!tag) throw new Exception("Tag not found", { status: 404, code: "E_NOT_FOUND" });
        await tag.delete();
        return ctx.response.noContent();
    }

    /** POST /api/v1/admin/customers/:id/tags — create-tag-if-missing then attach to customer. */
    async attach(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCustomerTagAttachValidator);
        const name = normalizeTagName(payload.tag);
        const tagId = await db.transaction(async (trx) => {
            let tag = await CustomerTag.findBy("name", name, { client: trx });
            if (!tag) tag = await CustomerTag.create({ name }, { client: trx });
            await trx
                .insertQuery()
                .table("customer_tag_pivot")
                .insert({ customer_id: Number(customer.id), tag_id: Number(tag.id) })
                .onConflict(["customer_id", "tag_id"])
                .ignore();
            return Number(tag.id);
        });
        const tag = await CustomerTag.findOrFail(tagId);
        return { data: new CustomerTagTransformer(tag).toObject() };
    }

    /** DELETE /api/v1/admin/customers/:id/tags/:tagId — detach tag from customer (tag row stays). */
    async detach(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const tagId = Number(ctx.params.tagId);
        if (!Number.isFinite(tagId)) throw new Exception("Tag not found", { status: 404, code: "E_NOT_FOUND" });
        await db.from("customer_tag_pivot").where("customer_id", Number(customer.id)).where("tag_id", tagId).delete();
        return ctx.response.noContent();
    }

    private async findCustomerOrFail(id: unknown) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        const customer = await Customer.query().where("id", numeric).whereNull("deleted_at").first();
        if (!customer) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        return customer;
    }
}
