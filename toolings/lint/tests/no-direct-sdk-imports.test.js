import rule from "../rules/no-direct-sdk-imports.js";

import { ruleTester } from "./helpers.js";

ruleTester.run("no-direct-sdk-imports", rule, {
    valid: [
        'import { api } from "#/lib/api";',
        /** Types, envelopes and errors carry no client and no locale — the SDK is their right source. */
        'import type { Paginated, Resource } from "@calibra/sdk";',
        'import { BackendError } from "@calibra/sdk";',
        'import { unwrapResource, type MoneyMinor } from "@calibra/sdk";',
        /** A type-only import of the factory constructs nothing at runtime. */
        'import type { createApiClient } from "@calibra/sdk";',
        'import { type createApiClient } from "@calibra/sdk";',
        /** A same-named factory from an unrelated package is not ours to police. */
        'import { createApiClient } from "some-other-sdk";',
    ],
    invalid: [
        { code: 'import { createApiClient } from "@calibra/sdk";', errors: [{ messageId: "factory" }] },
        { code: 'import { createStorefrontClient } from "@calibra/sdk";', errors: [{ messageId: "factory" }] },
        { code: 'import { BackendError, createApiClient } from "@calibra/sdk";', errors: [{ messageId: "factory" }] },
        { code: 'export { createApiClient } from "@calibra/sdk";', errors: [{ messageId: "factory" }] },
    ],
});
