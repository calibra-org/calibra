import rule from "../rules/semantic-tokens.js";

import { ruleTester } from "./helpers.js";

ruleTester.run("semantic-tokens", rule, {
    valid: [
        '<div className="bg-surface text-muted border-border rounded-md gap-4" />',
        '<span className="text-danger bg-success border-warning" />',
        /** Non-colour utilities that happen to carry a numeric step. */
        '<div className="gap-4 p-2 grid-cols-3 z-50 duration-300" />',
        /** A colour family with no numeric step is a semantic role, not a palette entry. */
        '<div className="text-primary bg-accent border-input" />',
        /** The banned family name inside unrelated prose is not a utility. */
        'const copy = "the red button is on the right";',
    ],
    invalid: [
        { code: '<div className="text-red-600" />', errors: [{ messageId: "raw-palette" }] },
        { code: '<div className="bg-emerald-100 p-4" />', errors: [{ messageId: "raw-palette" }] },
        { code: 'const c = "border-amber-500";', errors: [{ messageId: "raw-palette" }] },
        { code: "const c = `ring-sky-300 ${extra}`;", errors: [{ messageId: "raw-palette" }] },
        { code: '<div className="hover:bg-rose-50" />', errors: [{ messageId: "raw-palette" }] },
    ],
});
