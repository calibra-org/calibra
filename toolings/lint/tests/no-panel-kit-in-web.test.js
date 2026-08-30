import rule from "../rules/no-panel-kit-in-web.js";

import { ruleTester } from "./helpers.js";

ruleTester.run("no-panel-kit-in-web", rule, {
    valid: [
        'import { cn } from "@calibra/shared";',
        'import { Button } from "#/components/button";',
        'import type { Product } from "@calibra/sdk";',
    ],
    invalid: [
        { code: 'import { Button } from "@calibra/panel-kit";', errors: [{ messageId: "forbidden" }] },
        { code: 'import { Dialog } from "@calibra/panel-kit/dialog";', errors: [{ messageId: "forbidden" }] },
        { code: 'export * from "@calibra/panel-kit";', errors: [{ messageId: "forbidden" }] },
    ],
});
