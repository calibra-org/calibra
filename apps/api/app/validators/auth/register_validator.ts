import vine from "@vinejs/vine";
import type { FieldContext } from "@vinejs/vine/types";

import User from "#models/user";

/**
 * Email uniqueness as a reusable VineJS rule. Lookup is case-insensitive because the underlying
 * `email` column is `citext`. Async by definition; VineJS auto-detects but the option is set
 * explicitly so the docs at the call site read cleanly.
 */
const isUniqueUserEmail = vine.createRule(
    async (value: unknown, _options: undefined, field: FieldContext) => {
        if (typeof value !== "string") return;
        const existing = await User.findBy("email", value);
        if (existing) {
            field.report("The {{ field }} has already been taken", "database.unique", field);
        }
    },
    { name: "userEmailUnique", isAsync: true },
);

const passwordRule = vine
    .string()
    .minLength(8)
    .maxLength(128)
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/);

export const registerValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254).use(isUniqueUserEmail()),
        password: passwordRule,
        first_name: vine.string().trim().minLength(1).maxLength(80),
        last_name: vine.string().trim().minLength(1).maxLength(80),
        /**
         * Phone normalization happens in the controller — at validation time we only bound the
         * length so the normalizer has something sensible to work with.
         */
        phone: vine.string().trim().minLength(4).maxLength(32).optional(),
        country_default: vine.string().trim().fixedLength(2).optional(),
    }),
);
