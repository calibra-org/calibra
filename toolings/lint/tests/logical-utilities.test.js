import rule from "../rules/logical-utilities.js";

import { ruleTester } from "./helpers.js";

ruleTester.run("logical-utilities", rule, {
    valid: [
        '<div className="ms-4 me-2 ps-3 pe-1 text-start rounded-s" />',
        '<div className="mt-4 mb-2 py-3 text-center gap-2" />',
        /** Vertical and axis utilities are direction-neutral. */
        '<div className="mx-auto px-4 inset-y-0 overflow-x-auto" />',
        /** A word ending in the utility's letters is not the utility. */
        'const copy = "normal-4 formal-2";',
    ],
    invalid: [
        { code: '<div className="ml-4" />', errors: [{ messageId: "physical" }] },
        { code: '<div className="pr-2 pt-1" />', errors: [{ messageId: "physical" }] },
        { code: '<div className="text-left" />', errors: [{ messageId: "physical" }] },
        { code: '<div className="-mr-2" />', errors: [{ messageId: "physical" }] },
        { code: '<div className="rounded-l" />', errors: [{ messageId: "physical" }] },
        { code: '<div className="left-0 absolute" />', errors: [{ messageId: "physical" }] },
    ],
});
