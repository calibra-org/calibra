import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware wrappers around `next/link`, `next/navigation`, and `redirect`. Always import these
 * instead of the bare Next.js equivalents so locale prefixes stay correct.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
