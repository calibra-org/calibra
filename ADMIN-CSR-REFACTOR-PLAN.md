================================================================
TASK — De-RSC the admin panel: move all page data to client React Query (multi-agent / ultracode refactor)
================================================================

Convert `apps/admin` (Next.js 16 admin panel) from React Server Component (RSC) data-fetching to **100% client-side TanStack Query**. Every page keeps a *thin server shell* (locale + metadata + auth gate only); **all entity data is fetched in the browser through the existing same-origin `/api/admin` proxy**. The `server-repos.ts` data layer is deleted. The bar: every authenticated screen renders its chrome instantly and streams data into per-widget skeletons — never a blank 60-second spinner again, and the dev can debug every fetch in the browser Network tab.

**Environment — CONTINUATION, do NOT bootstrap a new spin.** Work on the existing worktree:
- Worktree: `/home/inf1nite-lo0p/calibra-org/calibra/.claude/worktrees/admin-csr-refactor`
- Branch: `spin/admin-csr-refactor`
- A draft PR could not be opened automatically (GitHub collaborator perms); open one manually if perms allow, otherwise push to the branch.
- Verify before starting: `git -C .claude/worktrees/admin-csr-refactor status -s` and `pnpm -s spin doctor admin-csr-refactor --json` (exit 0 = healthy; 2 = api/prom down).
- All paths below are repo-relative to that worktree root.

**This refactor is executed by the `Workflow` tool — it brings up MULTIPLE parallel sub-agents.** See §8 (Ultracode workflow). One human-readable rule governs the whole run: **shared modules are edited serially in the main thread; per-page work fans out in parallel because each group's file set is disjoint by construction.**

----------------------------------------------------------------
1. WHY — the RSC pattern caused production outages
----------------------------------------------------------------

The admin's server pages call `server-repos.ts`, and four of those repos do a **per-row fan-out**:

```
listCategories({ limit: 200 })
  → GET /admin/categories                       (1 request → 84 rows for a real tenant)
  → Promise.all(rows.map(GET /admin/products?category={id}&limit=1))   (84 concurrent requests)
```

`listTags`, `listBrands`, `listAttributesWithTerms` are identical. Multi-tenancy made this **fatal**: the API's `tenant_context_middleware` opens ONE Postgres transaction per request and **holds that connection for the entire request** (the `app.current_tenant` GUC lives on the transaction). Pool max = 20. 84 concurrent SSR sub-requests ⇒ 64 of them block on connection acquisition ⇒ `KnexTimeoutError: pool is probably full` after knex's 60s acquire timeout. Reproduced live: **65×500 + 19 requests hanging 60s each**. That 60s hang is the "categories/tags pages forever loading" symptom.

The fan-out is **dead weight**: `GET /admin/categories` already returns the count as `used_count` (the controller does `.withCount("products", q => q.as("used_count"))`). The SSR comment *"the index doesn't return product counts"* is simply stale.

Tests never caught it because the Japa suite runs as a **BYPASSRLS** role with a `DB_DEFAULT_TENANT` pool hook and tiny seed data, and never exercises the SSR fan-out across a realistic dataset.

**Why client React Query fixes it structurally:** each hook is an independent browser request through the proxy; there is no outer long-held transaction to stack sub-requests inside, requests acquire+release a connection in milliseconds, React Query dedupes/caches/parallelizes with its own concurrency ceiling, and the count comes from `used_count` so there is no fan-out at all. The class of bug disappears.

----------------------------------------------------------------
2. ARCHITECTURAL RULES (load-bearing — violate these and the refactor regresses)
----------------------------------------------------------------

1. **Thin server shell, client data.** Every `page.tsx` stays a server component that does ONLY: `setRequestLocale(locale)`, `generateMetadata` (static localized title — see rule 6), and renders a `"use client"` view. **No `apiServer()`, no `server-repos` data import, no `Promise.all` data fetch in any page.**
2. **Auth gating STAYS server-side.** `(authenticated)/layout.tsx` keeps calling `requireSession(locale)`. The bearer token stays in the httpOnly `admin_session` cookie and is injected by the proxy server-side. **Never move the token to client JS. Never add a client-side `/auth/me` redirect guard** — the server layout already does it.
3. **Browser data goes through the proxy, never the SDK.** Client hooks call `apiGet`/`apiMutate` from `#/lib/queries/api-client` → `/api/admin/<path>`. **NEVER import `@calibra/sdk` in a `"use client"` module. NEVER fetch the AdonisJS origin directly.**
4. **Reuse adapters; never duplicate.** The `toAdminProduct` / `toAdminOrder` / `toAdminCustomer` / … adapters in `src/lib/adapters/*.ts` are shared. Client hooks call them inside React Query `select`. Do not re-implement snake→camel mapping in a hook.
5. **Every list page composes a `TableViewQuery`.** Use `useTableView()` for URL-synced sort/filter/pagination and `tableViewQueryToSdkQuery()` to build the proxy query. Do not invent per-facet param keys.
6. **`generateMetadata` is static.** Use a localized title from the page's namespace (e.g. `t("title")` / `t("detailTitle")`). **Do NOT fetch an entity to title the tab** — that would re-introduce server data fetching. (Order-number-in-title etc. is explicitly out of scope; if ever wanted it becomes a backend `?fields=` follow-up, not an SSR fetch.)
7. **Write-serial for shared modules.** `server-repos.ts`, `lib/types.ts`, `lib/adapters/*`, and any hook file consumed by >1 page group are edited ONLY in the serial phases (§8 Phase 0 / Phase 3). Parallel agents touch only their own `page.tsx` + their own view files + their own resource hook file.
8. **The fan-out fix is folded in here** (not patched on `main`). The new client taxonomy hooks read `used_count`; `server-repos` fan-out code is deleted, not ported.

----------------------------------------------------------------
3. READ FIRST (every implementer agent reads these before touching code)
----------------------------------------------------------------

Reference patterns to MIRROR (these are the target shape — copy them):
1. `src/app/[locale]/(authenticated)/dashboard/page.tsx` — the canonical **thin server shell**: `generateMetadata` + `setRequestLocale` + `return <DashboardClient />`. No data.
2. `src/app/[locale]/(authenticated)/orders/page.tsx` — same shell rendering an already-client list view (`OrdersList`).
3. `src/lib/queries/orders.ts` — canonical **list hook** (`useOrdersList`): `useTableView` query → `tableViewQueryToSdkQuery` → `apiGet("orders", …)` → `select` maps via `toAdminOrderListRow`. Also `useOrder` (detail) + mutations.
4. `src/lib/queries/coupons.ts` — canonical **detail + mutation** hooks (`useCoupon`, `useCreateCoupon`, `useUpdateCoupon`) using `apiMutate` + `invalidateQueries`.
5. `src/views/products/categories/queries.ts` — **already has `useCategoriesList`** calling `apiGet("categories")`; its `toAdminCategory` currently hardcodes `productCount: 0` (the bug to fix → `c.used_count ?? 0`). The categories page just needs to consume this hook instead of an SSR seed.

Shared infrastructure to REUSE — do not reinvent:
6. `src/lib/queries/api-client.ts` — `apiGet<T>(path, {locale, query, signal})` and `apiMutate<T>(method, path, {locale, body, ifMatch})`. CSRF + bearer handled for you.
7. `src/lib/queries/QueryProvider.tsx` — already mounted in `(authenticated)/layout.tsx`; staleTime 5m, IDB persistence. Do not remount.
8. `src/lib/table-view/` — `useTableView`, `tableViewQueryToSdkQuery`, `serialize`, `dateFilterValueToTableViewFilter`. The list-query grammar.
9. `src/lib/adapters/*.ts` — `toAdminProduct`, `toAdminOrder`, `toAdminCustomer`, `toAdminCoupon`, `toAdminReview`, product-detail shapes. Reuse in `select`.
10. `src/lib/types.ts` — camelCase admin view types (`AdminCategory`, `AdminOrder`, `Paginated<T>`, `LocalizedString`, …).
11. `src/app/api/admin/[...path]/route.ts` — the proxy. **Already supports GET/POST/PUT/PATCH/DELETE**, CSRF, bearer, `X-Calibra-Tenant`, 401-clears-cookie. **No change required.**

What is being DELETED:
12. `src/lib/server-repos.ts` — every data-fetching export is removed once no page imports it (serial Phase 3). Static-fixture exports move to a client-importable constants module (§5 Group G).

Project conventions (the repo's `apps/admin/AGENTS.md` + root `AGENTS.md` — obey):
13. shadcn/ui New York primitives; Tailwind v4 **logical** utilities (`ms-*`/`me-*`/`text-start`), never `ml-`/`pr-`. `cn` from `#/lib/utils`.
14. Navigation: import `Link`/`redirect`/`useRouter`/`usePathname` from `#/lib/i18n/navigation`, **never** bare `next/link`/`next/navigation`.
15. `#/*` = `src/*`. JSDoc `/** */` only — **no `//` line comments**. Commit scope is **`admin`** (Conventional Commits, subject-only by default).

----------------------------------------------------------------
4. TARGET ARCHITECTURE — the three patterns every conversion uses
----------------------------------------------------------------

**Pattern A — thin server page (`page.tsx`).** Mirror dashboard:

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoriesView } from "#/views/products/categories/categories-view";

interface PageProps { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Categories" });
    return { title: t("title") };
}

export default async function CategoriesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CategoriesView />;          // no initialRows prop, no SSR fetch
}
```

For dynamic routes, forward only the route param (string), never fetched data:
```tsx
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <CustomerDetailView customerId={Number(id)} />;
}
```

**Pattern B — client view with skeleton (`*-view.tsx`, `"use client"`).** Drop `initialRows`/initial-data props; subscribe to the hook; render a skeleton on `isLoading` and an error state on `isError`:

```tsx
"use client";
import { useCategoriesList } from "./queries";
import { CategoryTree } from "./category-tree";
import { TableSkeleton } from "#/components/ui/table-skeleton";   // reuse the existing skeleton primitive

export function CategoriesView() {
    const { data, isLoading, isError, refetch } = useCategoriesList({ limit: 200 });
    if (isLoading) return <TableSkeleton rows={8} />;
    if (isError) return <ErrorState onRetry={refetch} />;
    return <CategoryTree rows={data.data} />;
}
```

**Pattern C — client hook (`src/lib/queries/<resource>.ts` or co-located `views/.../queries.ts`).** Mirror `useOrdersList`. List hooks use TableView; detail hooks key by id; both run `useLocale()` and map via the shared adapter:

```ts
export function useMediaList(params: MediaListParams = {}) {
    const locale = useLocale() as Locale;
    const query = params.query ?? defaultTableViewQuery({ limit: 60 });
    const sdkQuery = tableViewQueryToSdkQuery(query, { month: params.month } satisfies MediaListExtras);
    return useQuery<MediaListEnvelope, Error, Paginated<AdminMedia>>({
        queryKey: ["admin", "media", "list", { locale, sdkQuery }],
        queryFn: ({ signal }) => apiGet<MediaListEnvelope>("media", { locale, query: sdkQuery, signal }),
        select: (p) => ({ data: (p.data ?? []).map(toAdminMedia), meta: p.meta ?? fallbackMeta(query, p) }),
    });
}
```

**Skeleton rule:** every converted view MUST show a loading skeleton (reuse existing skeleton primitives under `src/components/ui/`; if a fitting one does not exist, add it in Phase 0, not per-agent) and a retry-able error state. No blank flashes, no infinite spinners.

----------------------------------------------------------------
5. CONVERSION INVENTORY — 24 pages, grouped (each group = one parallel agent)
----------------------------------------------------------------

Legend: **[H]** client hook already exists (reuse) · **[N]** new hook needed · **[S]** static fixture (no API) · **fix** = drops a fan-out.

### Group A — products-taxonomy  (owns the fan-out bug)
| Page | server-repos removed | Hook |
|---|---|---|
| `products/categories/page.tsx` | `listCategories` **fix** | `useCategoriesList` **[H]** — set `productCount: c.used_count ?? 0` in `toAdminCategory` |
| `products/tags/page.tsx` | `listTags` **fix** | `views/products/tags/queries.ts` — reuse or add `useTagsList`, read `used_count` |
| `products/brands/page.tsx` | `listBrands` **fix** | `views/products/brands/queries.ts` — reuse or add `useBrandsList`, read `used_count` |
| `products/attributes/page.tsx` | `listAttributesWithTerms` **fix** | `useAttributesList` **[N]** — render WITHOUT eager term-preview fan-out; lazy-load terms on row-expand via `useAttributeTerms`. See §9 RISK. |
| `products/attributes/[id]/page.tsx` | `getAttribute`, `listAttributeTerms` | `useAttribute` **[N]** + `useAttributeTerms` **[N]** |

### Group B — products-detail  (shared hooks pre-built in Phase 0)
| Page | server-repos removed | Hook |
|---|---|---|
| `products/[id]/page.tsx` | `getProductDetail`, `listTaxClassOptions`, `listShippingClassOptions` | `useProductDetail(id)` **[N]**, `useTaxClassOptions` **[N]**, `useShippingClassOptions` **[N]** |
| `products/new/page.tsx` | `listTaxClassOptions`, `listShippingClassOptions` | same option hooks (reuse) |

### Group C — orders
| Page | server-repos removed | Hook |
|---|---|---|
| `orders/[id]/page.tsx` | `getOrder` (was metadata-only → static title now) | `useOrder` **[H]** (detail view already client) |
| `orders/[id]/invoice/page.tsx` | `getOrder` | `useOrder` **[H]** — see print RISK §9 |
| `orders/[id]/packing-slip/page.tsx` | `getOrder` | `useOrder` **[H]** — see print RISK §9 |
| `orders/new/page.tsx` | `listPaymentGateways` | `usePaymentGateways` **[N]** (shared w/ Group G — Phase 0) |

### Group D — customers
| Page | server-repos removed | Hook |
|---|---|---|
| `customers/[id]/page.tsx` | `getCustomer` (was metadata-only → static title) | `useCustomer` **[H]** |

### Group E — media
| Page | server-repos removed | Hook |
|---|---|---|
| `media/page.tsx` | `listMedia`, `listMediaMonths` | `useMediaList` **[N]**, `useMediaMonths` **[N]** |
| `media/[id]/page.tsx` | `getMedia`, `listMedia`, `listMediaMonths` | `useMedia` **[N]** + the two above |

### Group F — reports
| Page | server-repos removed | Hook |
|---|---|---|
| `reports/page.tsx` | `getSalesReport` (renders charts server-side today) | `useSalesReport` **[N]** — build client view + charts |
| `reports/top-sellers/page.tsx` | `getTopSellersReport` **[S]** | client view over the fixture/constant |

### Group G — store-config
| Page | server-repos removed | Hook |
|---|---|---|
| `branding/page.tsx` | `getBranding` | `useBranding` **[H]** (`lib/queries/branding.ts`) |
| `payments/page.tsx` | `listPaymentGateways` | `usePaymentGateways` **[N]** (Phase 0) |
| `payments/[code]/page.tsx` | `getPaymentGateway` | `usePaymentGateway(code)` **[N]** |
| `tax/classes/page.tsx` | `listTaxClasses` **[S]** | client view over constants |
| `tax/rates/page.tsx` | `listTaxRates` **[S]** | client view over constants |
| `shipping/zones/page.tsx` | `listShippingZones` **[S]** | client view over constants |
| `shipping/methods/page.tsx` | `listShippingMethods` **[S]** | client view over constants |
| `settings/[group]/page.tsx` | `getSettingsGroup` **[S]** | client view over constants (dedicated views already client) |

**Static fixtures (Group F top-sellers + all Group G [S]):** move the fixture data out of `server-repos.ts` into a plain `src/lib/fixtures/<name>.ts` constants module (importable from client) and render it in a `"use client"` view with the same skeleton/error shape (instant since data is local). This is mechanical and lowest-risk — do it last within each group.

----------------------------------------------------------------
6. FRONTEND FILE LAYOUT (after the PR)
----------------------------------------------------------------

```
src/lib/queries/
├── api-client.ts                 ← REUSE (no change)
├── products.ts                   ← NEW  useProductDetail, useTaxClassOptions, useShippingClassOptions
├── attributes.ts                 ← NEW  useAttributesList, useAttribute, useAttributeTerms
├── media.ts                      ← NEW  useMediaList, useMedia, useMediaMonths
├── payments.ts                   ← NEW  usePaymentGateways, usePaymentGateway
├── reports.ts                    ← NEW  useSalesReport
├── orders.ts / customers.ts / coupons.ts / branding.ts / …  ← REUSE existing
src/views/products/
├── categories/queries.ts         ← EXTEND  toAdminCategory.productCount = used_count
├── tags/queries.ts               ← EXTEND/NEW  useTagsList (used_count)
├── brands/queries.ts             ← EXTEND/NEW  useBrandsList (used_count)
├── categories/categories-view.tsx ← EXTEND  drop initialRows, consume hook + skeleton
├── tags/… brands/… attributes/…  ← EXTEND  same shape
src/views/{orders,customers,media,reports,...}/...-view.tsx  ← EXTEND  consume hooks
src/lib/fixtures/                 ← NEW  tax-classes.ts, tax-rates.ts, shipping-zones.ts,
│                                        shipping-methods.ts, settings-groups.ts, top-sellers.ts
src/app/[locale]/(authenticated)/**/page.tsx   ← EXTEND  24 pages → thin server shells
src/lib/server-repos.ts           ← SHRINK→DELETE  (serial Phase 3; remove dead exports, then file)
```

Each of the 24 `page.tsx` files belongs to exactly one group; the per-group view + hook files are disjoint between groups. The only file >1 group must touch is `server-repos.ts` (handled serially) and the two Phase-0 shared hooks (`payments.ts`, `products.ts` option hooks).

----------------------------------------------------------------
7. VERIFICATION (per slice and at the end — run from the worktree root)
----------------------------------------------------------------

```sh
pnpm --filter @calibra/admin typecheck          # tsc --noEmit
pnpm --filter @calibra/admin test               # vitest (unit; --passWithNoTests)
biome check apps/admin/src                       # lint + format (root: pnpm lint:biome)
pnpm --filter @calibra/admin build              # next build (standalone)
pnpm --filter @calibra/admin test:e2e           # playwright — needs the spin stack up
```

E2E specs that MUST stay green (they assert browser behavior, so CSR is transparent — but they are the real guard that the fan-out is gone): `tests/e2e/list-pages-render.spec.ts` (no 422/5xx from the proxy on initial render + network-idle), `analytics-render.spec.ts`, `coupons.spec.ts`, `tenant.spec.ts`, `query-params-wire-grammar.spec.ts`. Bring the stack up with `pnpm -s spin doctor admin-csr-refactor --json` (exit 0) before running e2e; the base URL is per-tenant (`aurora.admin.localhost`).

**Anti-regression grep (must return ZERO hits in `src/app/**/page.tsx`):**
```sh
grep -rnE "from \"#/lib/server-repos\"|apiServer\(|Promise\.all" src/app
grep -rn "@calibra/sdk" src/views src/lib/queries        # no SDK in client modules
```

Commit per page-group: `feat(admin): de-RSC <group> — client React Query`. Keep commits small; push often.

----------------------------------------------------------------
8. ULTRACODE WORKFLOW — phase breakdown (this runs via the `Workflow` tool, MULTIPLE parallel agents)
----------------------------------------------------------------

The executing agent authors a `Workflow` script. **Parallel where file sets are disjoint; serial where modules are shared.** Group file sets were partitioned in §5/§6 specifically so Phase 1 can fan out safely.

**Phase 0 — Shared scaffold (SERIAL, main thread, one agent).** No parallelism — these are shared modules.
- Create the NEW shared hook files consumed by >1 group: `lib/queries/payments.ts` (`usePaymentGateways` — used by Group C orders/new AND Group G payments) and the product-option hooks in `lib/queries/products.ts` (`useTaxClassOptions`, `useShippingClassOptions` — used by both Group B pages).
- Add any missing shared view types to `lib/types.ts` (`AdminMedia`, `AdminPaymentGateway`, `AdminSalesReport`, …) and any missing adapter functions to `lib/adapters/*` (reuse existing where present).
- Add a shared `TableSkeleton`/`DetailSkeleton` primitive under `src/components/ui/` if one is missing.
- Verify `typecheck` green. Commit `chore(admin): scaffold shared client hooks/types for de-RSC`.

**Phase 1 — Per-group conversion (PARALLEL, 7 agents).** Fan out one agent per group A–G. Each agent, scoped to ONLY its own `page.tsx` + `views/<area>/*` + its own resource hook file (`attributes.ts`, `media.ts`, `reports.ts`, group-local `queries.ts`):
- Convert each page to Pattern A (thin shell, static metadata title).
- Convert each view to Pattern B (consume hook, skeleton + error state).
- Add/extend the group's client hooks to Pattern C (reuse Phase-0 shared hooks; taxonomy hooks read `used_count`).
- **Do NOT edit `server-repos.ts`, `lib/types.ts`, or the Phase-0 shared hook files.** If a needed shared type/hook is missing, the agent reports it back (it does not add it in parallel).
- Run `typecheck` + `biome check` on its own files; return a per-group report (files changed, hooks added, anything that still imports server-repos).
- Because the groups' file sets are disjoint, run them in the SHARED worktree WITHOUT per-agent `isolation: 'worktree'` (cheaper; no conflicts by construction). Use worktree isolation ONLY if a late discovery forces two agents onto the same file.

**Phase 2 — Adversarial review (PARALLEL, per-group reviewers).** For each group, a fresh skeptic agent verifies against acceptance criteria (§10): no `server-repos`/`apiServer`/`Promise.all`/SDK import in that group's pages or client modules; every converted view has a skeleton + error state; metadata is static; navigation uses `#/lib/i18n/navigation`; no `//` comments; `used_count` actually wired for taxonomy. Reviewers return PASS/FAIL with file:line evidence. Any FAIL loops back to a Phase-1 fix for that group only.

**Phase 3 — Synthesis + cleanup (SERIAL, main thread).**
- Now that no page imports `server-repos`, delete every dead data-fetching export; move surviving static fixtures to `src/lib/fixtures/*` (if not already); delete `server-repos.ts` if fully empty. This is the ONLY edit to that shared file — done once, serially.
- Run the full anti-regression grep (§7) — must be zero hits.
- Full gate: `typecheck` + `test` + `biome check` + `build` + `test:e2e` (stack up). 
- Commit `refactor(admin): remove server-repos data layer`. Push. Update the PR body with the §10 checklist.

The Workflow `meta.phases` should mirror these four. Phase 1 and Phase 2 are the parallel fans (7 agents each); Phase 0 and Phase 3 are single-agent serial barriers. Log dropped/odd cases via `log()` so nothing is silently skipped.

----------------------------------------------------------------
9. RISKS & non-obvious constraints
----------------------------------------------------------------

- **next-intl needs the server shell.** `setRequestLocale` + `generateMetadata` + `<html dir>` in `[locale]/layout.tsx` MUST remain server. "No RSC" means *no RSC data fetching*, not zero server components. Do not convert the two layouts to client.
- **Auth guard stays server (rule 2).** Do not add a client `/auth/me` redirect; `requireSession` in `(authenticated)/layout.tsx` already gates + validates tenant (RULE A) + impersonation (RULE D). Leaving it server-side avoids an authenticated-shell flash.
- **Print pages** (`orders/[id]/invoice`, `orders/[id]/packing-slip`) render for print preview. After CSR they must still produce a clean print DOM — ensure the client view renders fully before `window.print()` triggers (gate print on `!isLoading`), and keep print CSS. Verify with a manual print-preview, not just network-idle.
- **Attributes term-preview gap (Group A).** The old `listAttributesWithTerms` fan-out fetched up to 8 term *names* per attribute for the row preview — the API exposes no `term_preview`/`term_count` on `GET /admin/attributes`. Do NOT reproduce an eager client fan-out (it would re-create the N+1, merely moved to the browser). Instead: render the attributes list without the eager preview (show term count only if available; otherwise lazy-load terms via `useAttributeTerms` on row-expand). **STOP-and-ask gate:** propose a backend follow-up to add `term_count` + a small `term_preview[]` to the attributes index (an `apps/api` change: controller `withCount` + transformer + Japa test + OpenAPI regen) — do not silently change the API in this FE-only refactor.
- **Static-fixture pages** return local data — they were never the outage, but convert them anyway for a consistent client/skeleton pattern and to fully empty `server-repos.ts`. Keep them trivially instant.
- **Metadata titles** lose any entity-derived text (order number in tab title, etc.). Accepted per rule 6. Flag in the PR body so it is a conscious product call.
- **No new deps.** This refactor needs none (TanStack Query, next-intl, shadcn already present). If an agent thinks it needs one → STOP and ask; the repo requires human approval for every dep (catalog policy).
- **Server actions stay.** `loginAction`/`logoutAction`/`stopImpersonationAction` in `lib/auth-actions.ts` are auth mutations, not data fetching — do not touch them.

----------------------------------------------------------------
10. DEFINITION OF DONE
----------------------------------------------------------------

Functional — click through on the running spin (`*.admin.local.spin.localhost`):
- [ ] `/products/categories`, `/tags`, `/brands` load instantly with a skeleton, then the tree/list — **no 60s spinner**, product counts correct (from `used_count`).
- [ ] `/products/attributes` loads without an eager per-row term fan-out; term preview is lazy or count-only.
- [ ] `/products/[id]`, `/products/new`, `/products/attributes/[id]` render via client hooks with skeletons.
- [ ] `/orders/[id]`, `/orders/[id]/invoice`, `/orders/[id]/packing-slip`, `/orders/new` render client-side; print pages produce a correct print DOM.
- [ ] `/customers/[id]`, `/media`, `/media/[id]`, `/reports`, `/reports/top-sellers`, `/branding`, `/payments`, `/payments/[code]`, `/tax/*`, `/shipping/*`, `/settings/[group]` all render via client data/fixtures with skeletons.
- [ ] Every list page deep-links its sort/filter/page state in the URL via `useTableView` (existing `query-params-wire-grammar.spec.ts` green).

Technical:
- [ ] `grep -rnE "from \"#/lib/server-repos\"|apiServer\(|Promise\.all" src/app` → **0 hits**.
- [ ] `grep -rn "@calibra/sdk" src/views src/lib/queries` → **0 hits**.
- [ ] `server-repos.ts` deleted (or contains zero data-fetching exports); static fixtures live under `src/lib/fixtures/`.
- [ ] `typecheck`, `test`, `biome check`, `build`, `test:e2e` all green.
- [ ] No `//` comments introduced; navigation imports from `#/lib/i18n/navigation`; logical Tailwind utilities only.
- [ ] No new deps (or human approval documented).
- [ ] Commits scoped `admin`, small, pushed; PR body has this checklist + a note that entity-derived metadata titles were intentionally dropped + the attributes term-preview backend follow-up.

Security / invariant assertions:
- [ ] Bearer token never appears in client JS or the Network tab response bodies (only the proxy sees it). Verified in DevTools.
- [ ] `requireSession` still gates `(authenticated)` server-side; an unauthenticated hit to any converted page still bounces to `/login` (tenant.spec.ts green).

----------------------------------------------------------------
11. EXECUTION ORDER
----------------------------------------------------------------

1. Verify the worktree/stack (`git status`, `spin doctor`). Do NOT bootstrap a new spin.
2. **Phase 0** shared scaffold (serial) → typecheck green → commit.
3. **STOP-and-ask gate:** the attributes term-preview backend follow-up (§9) — confirm whether to (a) ship count-only/lazy now + file the API change separately, or (b) include the `apps/api` change in this PR. Default to (a) unless told otherwise.
4. **Phase 1** fan out 7 group agents (parallel, disjoint files) → each verifies its own typecheck/lint.
5. **Phase 2** adversarial per-group review → loop any FAIL back to its group.
6. **Phase 3** serial cleanup of `server-repos.ts` → anti-regression grep → full gate (`typecheck`/`test`/`lint`/`build`/`e2e`) → commit → push.
7. Open/refresh the draft PR with the DoD checklist.

Push commits often in small logical scopes scoped `admin`; the draft PR refreshes on each push.
