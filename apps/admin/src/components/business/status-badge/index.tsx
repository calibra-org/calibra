/**
 * Tier-4 StatusBadge — generic tone-coloured status pill. Re-exports the existing flat-file
 * primitive from `components/StatusBadge.tsx` for the canonical tier-4 import path. The full
 * extraction (folder shape, tv() variants, dot/no-dot prop) is a follow-up once the inline tone
 * mapping in StatusBadge.tsx is rewritten on top of the tier-2 `Badge`.
 */
export { StatusBadge } from "#/components/StatusBadge";
