import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

/**
 * Family of domain exceptions that controllers can throw instead of hand-building
 * `response.status(...).json({ errors: [...] })` envelopes. Each one self-handles to
 * keep the response shape consistent: `{ errors: [{ message, code, ...meta }] }`.
 *
 * Throw one of these instead of doing the envelope inline; the global exception
 * handler picks them up via the framework's `handle()` mechanism.
 */
abstract class DomainException extends Exception {
    declare code: string;
    declare status: number;

    async handle(error: this, ctx: HttpContext) {
        return ctx.response
            .status(error.status)
            .json({ errors: [{ message: error.message, code: error.code, ...(error.meta ?? {}) }] });
    }

    /** Additional fields merged into the error envelope (`{ rule: "...", field: "...", ... }`). */
    meta?: Record<string, unknown>;
}

/** 404 — entity not found. Prefer Lucid's `findOrFail` which throws this automatically. */
export class ResourceNotFoundException extends DomainException {
    static status = 404;
    static code = "E_NOT_FOUND";
    constructor(message = "resource not found", meta?: Record<string, unknown>) {
        super(message, { status: 404, code: "E_NOT_FOUND" });
        this.meta = meta;
    }
}

/** 409 — request conflicts with current state (e.g. already-rolled-back import). */
export class ResourceConflictException extends DomainException {
    static status = 409;
    static code = "E_CONFLICT";
    constructor(message = "conflict", meta?: Record<string, unknown>) {
        super(message, { status: 409, code: "E_CONFLICT" });
        this.meta = meta;
    }
}

/** 410 — resource existed but is no longer available (expired download window, deleted asset). */
export class ResourceGoneException extends DomainException {
    static status = 410;
    static code = "E_GONE";
    constructor(message = "no longer available", meta?: Record<string, unknown>) {
        super(message, { status: 410, code: "E_GONE" });
        this.meta = meta;
    }
}

/** 422 — request was well-formed but violates a business rule (state machine, totals, …). */
export class BusinessRuleException extends DomainException {
    static status = 422;
    static code = "E_BUSINESS_RULE";
    constructor(message: string, rule: string, meta?: Record<string, unknown>) {
        super(message, { status: 422, code: "E_BUSINESS_RULE" });
        this.meta = { rule, ...(meta ?? {}) };
    }
}
