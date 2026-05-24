import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import Customer from "#models/customer";
import CustomerNote from "#models/customer_note";
import CustomerNoteTransformer from "#transformers/customer_note_transformer";
import { adminCustomerNoteCreateValidator, adminCustomerNoteUpdateValidator } from "#validators/admin/customer_validator";

export default class AdminCustomerNotesController {
    /** GET /api/v1/admin/customers/:customer_id/notes — newest first. */
    async index(ctx: HttpContext) {
        await this.findCustomerOrFail(ctx.params.customer_id);
        const notes = await CustomerNote.query()
            .where("customer_id", Number(ctx.params.customer_id))
            .preload("author")
            .orderBy("created_at", "desc");
        return { data: notes.map((n) => new CustomerNoteTransformer(n).toObject()) };
    }

    async store(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.customer_id);
        const payload = await ctx.request.validateUsing(adminCustomerNoteCreateValidator);
        const auth = await ctx.auth.authenticate();
        const note = await CustomerNote.create({
            customerId: Number(customer.id),
            authorUserId: Number(auth.id),
            body: payload.body,
        });
        await note.load("author");
        ctx.response.status(201);
        return { data: new CustomerNoteTransformer(note).toObject() };
    }

    async update(ctx: HttpContext) {
        const note = await this.findNoteOrFail(ctx.params.customer_id, ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCustomerNoteUpdateValidator);
        note.body = payload.body;
        await note.save();
        await note.load("author");
        return { data: new CustomerNoteTransformer(note).toObject() };
    }

    async destroy(ctx: HttpContext) {
        const note = await this.findNoteOrFail(ctx.params.customer_id, ctx.params.id);
        await note.delete();
        return ctx.response.noContent();
    }

    private async findCustomerOrFail(id: unknown) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        const customer = await Customer.query().where("id", numeric).whereNull("deleted_at").first();
        if (!customer) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        return customer;
    }

    private async findNoteOrFail(customerId: unknown, noteId: unknown) {
        const customerNumeric = Number(customerId);
        const noteNumeric = Number(noteId);
        if (!Number.isFinite(customerNumeric) || !Number.isFinite(noteNumeric)) {
            throw new Exception("Note not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const note = await CustomerNote.query()
            .where("customer_id", customerNumeric)
            .where("id", noteNumeric)
            .preload("author")
            .first();
        if (!note) throw new Exception("Note not found", { status: 404, code: "E_NOT_FOUND" });
        return note;
    }
}
