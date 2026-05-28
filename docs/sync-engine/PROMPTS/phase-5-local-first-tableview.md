================================================================
TASK — Sync Engine Phase 5: local-first filter/tab responsiveness (`useTableView`)
================================================================

Kill the "filter lags a beat" feel: today every facet/tab/sort click writes URL state via
`router.replace` (a Next App Router soft-navigation / RSC round-trip), and the toolbar
control only reflects the change AFTER that round-trip — so the checkbox itself feels
laggy. Make `useTableView` local-first: controls flip instantly from local state, the URL
syncs in the background, and the data fetch keeps showing the previous page
(`keepPreviousData`) until the new page lands. Separable from the rest of the engine —
ships independently — but it's the highest felt-latency win on the read side.

READ THE FOUNDATION DOC FIRST: `00-foundation.md` (§2.5). Independent
of Phases 1–4 (no flag needed; it's a pure responsiveness refactor that must preserve the
existing URL-as-wire contract).

Start a fresh worktree:

    pnpm spin sync-engine-phase-5

Verify with `pnpm spin doctor sync-engine-phase-5 --json`. Commit + push; PR refreshes.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

- `apps/admin/src/lib/table-view/use-table-view.ts` — THE file. Today it derives `query`
  from `useSearchParams()` via `parseTableViewQuery`, and every setter
  (`setFilter`/`setSort`/`setPage`/`setExtras`/`patch`/`resetFilters`) calls
  `writeAll → router.replace(...)`. The control state is therefore downstream of the
  navigation. (Note: `patch` + `resetFilters` were added recently to fix chained-write
  clobbers — preserve them.)
- `apps/admin/src/lib/table-view/serialize.ts` — `parseTableViewQuery` /
  `serializeTableViewQuery` (the canonical URL codec — DO NOT change the wire format).
- `apps/admin/src/lib/i18n/navigation.ts` — `useRouter`/`usePathname` (next-intl). Used by
  `useTableView` for `router.replace`.
- Consumers (must keep working unchanged): `apps/admin/src/views/{orders,customers,coupons}/list/*-list.tsx`,
  `apps/admin/src/views/products/{list,reviews}/*-list.tsx` — they read `tv.query`, `tv.<extra>`,
  and call the setters.
- **The contract test that must stay green:** `apps/admin/tests/e2e/query-params-wire-grammar.spec.ts`
  — asserts the address bar == the issued API request (no per-list rewrite). Local-first
  state must NOT break this: the URL is still canonical and still equals the request.

----------------------------------------------------------------
2. ARCHITECTURAL RULES
----------------------------------------------------------------

R1. **URL stays canonical; local state is an optimistic mirror.** The URL is still the
    source of truth for deep-links, back/forward, and the API request. Local state exists
    only to make the CONTROL render instantly; it is reconciled FROM the URL whenever
    `useSearchParams` changes (deep-link, back/forward, external nav).
R2. **One write path, non-blocking.** Wrap the `router.replace` in `startTransition` (React
    `useTransition`) so the navigation doesn't block the control update. The local mirror
    updates synchronously; the URL write is the deferred part.
R3. **No wire-format change.** `serialize.ts` is untouched. The address bar and the SDK
    query remain byte-identical (the e2e grammar spec is the guardrail).
R4. **`keepPreviousData` everywhere a list reads.** Confirm each list query uses
    `placeholderData: keepPreviousData` so the table shows the prior page dimmed instead of
    blanking while the new page fetches (most already do — fill any gaps). Expose an
    `isFetching`/pending signal so the toolbar can show a subtle in-flight affordance.
R5. **No regressions to `patch`/`resetFilters`/`setExtras` atomicity.** These exist to
    avoid chained-write clobbers; the local-first refactor must keep each a single
    coherent state update + single URL write.

----------------------------------------------------------------
3. SCOPE
----------------------------------------------------------------

**A. Local-first state in `useTableView`.**
- Hold `const [localQuery, setLocalQuery] = useState(() => parseTableViewQuery(searchParams))`
  and a `localExtras` mirror (seeded from the parsers).
- `useEffect` that re-syncs `localQuery`/`localExtras` FROM `searchParams` whenever the URL
  changes externally (back/forward/deep-link) — guard against clobbering an in-flight local
  edit (compare a monotonic "local revision" vs the URL).
- Every setter: (1) update the local mirror synchronously (so `tv.query`/`tv.<extra>` the
  components read reflects the click immediately), then (2) `startTransition(() =>
  writeAll(...))` to push the URL.
- `tv.query` returned to consumers reads from the local mirror (falls back to the parsed
  URL on first render / after external nav).
- Expose `tv.isPending` (from `useTransition`) so the toolbar can dim while the URL/RSC
  settles.

**B. Verify list queries keep previous data.** Audit `useOrdersList`/`useCustomersList`/
`useProductsList`/`useReviewsList`/`useCouponsList` for `placeholderData: keepPreviousData`
(or `(prev) => prev`); add where missing. Surface `isFetching` to the `DataTable` toolbar
for a quiet loading bar (do NOT swap to the full skeleton on a filter change — only on the
first load).

**C. Toolbar affordance.** A subtle top-of-table progress indicator (reuse an existing
spinner/skeleton primitive — do NOT add a dep) shown when `isFetching && !isLoading`.

----------------------------------------------------------------
4. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/admin/src/
├── lib/table-view/use-table-view.ts        ← EXTEND (local-first state + useTransition)
├── lib/table-view/use-table-view.test.ts   ← NEW/EXTEND (local mirror ↔ URL reconcile)
├── lib/queries/{orders,customers,coupons}.ts, lib/products/queries.ts, lib/reviews/queries.ts
│                                            ← EXTEND (ensure keepPreviousData; expose isFetching)
└── components/ui/data-grid/data-table.tsx / toolbar ← EXTEND (in-flight affordance)
```

----------------------------------------------------------------
5. NON-NEGOTIABLES
----------------------------------------------------------------

- Do NOT change `serialize.ts` / the wire grammar. The e2e grammar spec MUST stay green.
- Do NOT introduce nuqs or a new state lib; this is plain `useState` + `useTransition`.
- Preserve `patch`/`resetFilters`/`setExtras` single-write semantics.
- JSDoc only; commit scope `feat(admin): …`.
- Back/forward and deep-links must still drive the table (URL canonical).

----------------------------------------------------------------
6. DEFINITION OF DONE
----------------------------------------------------------------

Functional (manual + e2e):
  [ ] Clicking a facet checkbox flips it with no perceptible delay (control updates before
      the RSC navigation completes).
  [ ] Switching a status tab updates the active tab instantly; the table keeps the prior
      rows dimmed until the new page lands (no blank flash).
  [ ] A subtle in-flight indicator shows while fetching, not the full skeleton.
  [ ] Deep-linking a filtered URL and using browser back/forward still drive the table
      correctly (URL canonical).
  [ ] `query-params-wire-grammar.spec.ts` (address bar == request) still passes.
Technical:
  [ ] admin typecheck + vitest + `just lint` green.
  [ ] No new deps; `serialize.ts` unchanged.

----------------------------------------------------------------
7. EXECUTION ORDER
----------------------------------------------------------------

1. Refactor `useTableView` to local-first + `useTransition`; unit-test the local↔URL
   reconcile (including back/forward simulation).
2. Verify one list page end-to-end (orders) feels instant; confirm the e2e grammar spec.
3. Audit/expose `keepPreviousData` + `isFetching` across the other lists; add the toolbar
   affordance.

STOP-and-ask gate: if the local↔URL reconcile proves racy on rapid clicks (local edit lost
to a late `searchParams` echo), STOP and decide the revision-guard strategy before shipping
— a flaky filter is worse than a slightly-laggy one.

Push commits often in small logical scopes; the draft PR auto-refreshes.
