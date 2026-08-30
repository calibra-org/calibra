import rule from "../rules/icons-via-proxy.js";

import { ruleTester } from "./helpers.js";

ruleTester.run("icons-via-proxy", rule, {
    valid: [
        'import { ChevronIcon } from "#/icons";',
        'import { cn } from "@calibra/shared";',
        /** A package that merely starts with the same characters is a different package. */
        'import x from "lucide-react-native";',
    ],
    invalid: [
        { code: 'import { Check } from "lucide-react";', errors: [{ messageId: "direct" }] },
        { code: 'import Check from "lucide-react/dist/esm/icons/check";', errors: [{ messageId: "direct" }] },
        { code: 'export { Check } from "lucide-react";', errors: [{ messageId: "direct" }] },
        { code: 'const m = await import("lucide-react");', errors: [{ messageId: "direct" }] },
    ],
});
