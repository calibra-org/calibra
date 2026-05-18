# Examples

Worked before/after cases drawn from real comments under `packages/kit/src/`. Each example shows the source, the rewritten output, and a one-line note on the rule that applied.

Examples marked _illustrative_ are constructed cases for patterns that don't currently appear in the repo (TODO tags, JSX expression comments, URL-only references, deprecation, restatement, "weird workaround" flags). They follow the same rules.

The target output is the quality, density, and tone of React's own `.d.ts` declaration comments — contract-defining first sentence, structured tags only when locally evidenced, no embellishment.

## 1. Convert: multi-line `//` rationale

`packages/kit/src/orchestrator/GatewayStepTransition.tsx:98-99`

Source:

```ts
        if (!isKeyChange) {
            // Same-step re-render. Just refresh the snapshot for the
            // next real transition.
            lastCommittedHeightRef.current = newHeight;
            return;
        }
```

Rewritten:

```ts
        if (!isKeyChange) {
            /**
             * Same-step re-render. Refresh the snapshot for the next real transition.
             */
            lastCommittedHeightRef.current = newHeight;
            return;
        }
```

Convert + light compression (dropped "Just"). Indentation column preserved.

## 2. Convert: multi-line race-condition note in a test file

`packages/kit/src/drivers/stridge/__tests__/transformers.test.ts:213-215`

Source:

```ts
        // Race: gateway has the settlement record but the indexer hasn't attached `from.tx_id` yet.
        // The watcher must NOT mark the id as seen on this tick — otherwise the subsequent poll
        // (when tx_id finally arrives) would skip it permanently.
```

Rewritten:

```ts
        /**
         * Race: gateway has the settlement record but the indexer hasn't attached `from.tx_id` yet. The watcher must NOT mark
         * the id as seen on this tick — the subsequent poll (when tx_id finally arrives) would skip it permanently.
         */
```

Convert. Compression dropped "otherwise" (already implied by "would"). Race-condition fact, affected behavior, and consequence all kept verbatim.

## 3. Convert: regression rationale with kept ticket-style fact

`packages/kit/src/drivers/stridge/__tests__/transformers.test.ts:602-604`

Source:

```ts
        // After a completed deposit, the settlement is still inside the 10-minute recency window. The
        // resume probe used to surface it and re-route the user into processing → success, leaving the
        // dialog locked on a screen they already dismissed. The probe now skips terminal records.
```

Rewritten:

```ts
        /**
         * After a completed deposit, the settlement is still inside the 10-minute recency window. The resume probe used to
         * surface it and re-route the user into processing → success, leaving the dialog locked on a screen they already
         * dismissed. The probe now skips terminal records.
         */
```

Convert. Migration note ("used to … now …"), the affected window (10 minutes), and the user-visible bug (dialog locked) all preserved verbatim.

## 4. Skip: lint pragma stays as `//`

`packages/kit/src/ui/Image/Image.tsx:283`

```tsx
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional and stable per render
```

Unchanged. Biome only honors line-form pragmas. Note that this comment already documents its own rationale inline — this is the format reject-phrase candidates should aspire to.

## 5. Skip: TODO tag and JSX expression comment

_Illustrative._

```ts
// TODO: handle the case where the wallet is locked (STR-512)
```

```tsx
return (
    <div>
        {/* Hidden until the user opts in to advanced mode. */}
        {advanced && <AdvancedPanel />}
    </div>
);
```

Both unchanged. TODOs are a greppable convention; JSX expression comments aren't `//` and JSDoc form doesn't fit syntactically.

## 6. Polish in place: split `/** */` lines → one multi-line block

`packages/kit/src/orchestrator/GatewayStepTransition.tsx:72-78`

Source:

```ts
    /** Cached wrapper height from the previous commit. Read in the */
    /** layout effect when stateKey changes — the DOM has already   */
    /** updated to the new content by then, so we need a snapshot.  */
    const lastCommittedHeightRef = useRef<number | null>(null);
    /** Tracks the stateKey we last animated for, so the layout    */
    /** effect's run can tell whether the trigger is a real key    */
    /** change (run transition) or just an unrelated re-run (skip).*/
    const lastAnimatedKeyRef = useRef(stateKey);
```

Rewritten:

```ts
    /**
     * Cached wrapper height from the previous commit. Read in the layout effect when `stateKey` changes — the DOM has
     * already updated to the new content by then, so we need a snapshot.
     */
    const lastCommittedHeightRef = useRef<number | null>(null);
    /**
     * Tracks the `stateKey` we last animated for, so the layout effect's run can tell whether the trigger is a real key
     * change (run transition) or an unrelated re-run (skip).
     */
    const lastAnimatedKeyRef = useRef(stateKey);
```

Polish in place — multi-line `/** */` form, compression dropped "just", `stateKey` backticked. Two non-contiguous blocks stay separate.

## 7. Convert: layout rationale in a style file

`packages/kit/src/widgets/success-state/compound/SuccessState.styles.ts:154-155`

Source:

```ts
    actionRowPair: {
        // Two-button layout: each button takes equal width via flex:1
        // applied to the buttons themselves.
        alignItems: "stretch",
    },
```

Rewritten:

```ts
    actionRowPair: {
        /**
         * Two-button layout: each button takes equal width via `flex: 1` applied to the buttons themselves.
         */
        alignItems: "stretch",
    },
```

Convert. The "where the `flex: 1` lives" note is non-obvious from this style block alone (the rule sits on the children, not on this row), so the comment passes the bar.

## 8. Callback prop — the target shape

The repo's already-polished callbacks in `packages/kit/src/dialogs/DepositDialog.tsx:90-109` are the bar for this category. They name **when** the callback fires, **what** the parameter carries, and **how** the firing relates to the orchestrator's lifecycle:

```ts
        /**
         * Fires once when the dialog transitions from `closed` to any open step. Receives the
         * resolved open input derived from the entry state — `undefined` for an open-to-picker,
         * `{ method: "wallet", asset? }` for a wallet flow, `{ method: "transfer" }` for the
         * transfer-crypto flow.
         */
        onOpened?: (input: ResolvedOpenInput) => void;
        /**
         * Fires once when the dialog transitions back to `closed`. `atStep` is the last open step
         * (e.g. `success`, `error`, `confirmDeposit`) — useful for funnel drop-off attribution.
         */
        onClosed?: (atStep: DepositStateName) => void;
```

If the skill encountered a vague `// fires on close` above `onClosed`, it would only upgrade to the JSDoc above when the surrounding code (the reducer's `closed` transition, the `atStep` derivation) supports every clause. Without that anchoring code in view, the comment is flagged as `needs human rationale` instead.

## 9. Async cleanup — the target shape

`packages/kit/src/stridge/useStridgeDriver.ts:130-159` is the canonical async-cleanup pattern: a `cancelled` flag guards every `setState` call from the resolved promise, and the JSDoc above the effect names exactly which stale data the reset prevents.

```ts
        /**
         * Reset every cached datum the moment the driver identity flips (account switch, key
         * change). The new driver's promises are in flight; without this, the UI would keep
         * rendering the previous deposit address / brand / supported-assets until each new
         * promise resolves — long enough to flash stale data on the transfer-crypto card or a
         * wrong brand on the dialog title.
         */
        let cancelled = false;
        /* ... */
        driver.udaPromise.then((rows) => {
            if (!cancelled) setAddresses(rows);
        }, captureError);
```

By contrast, the same comment placed above an opaque `boot()` / `teardown()` pair has no such anchor:

```ts
useEffect(() => {
    boot();
    return () => {
        // cleanup async stuff
        teardown();
    };
}, []);
```

Unchanged. Reported as `needs human rationale`. Without a `cancelled` flag, an in-flight promise, or a `setState` call to point at, the skill cannot name a real cancellation concern — and the rule against inventing rationale forbids guessing.

## 10. Reject phrase with no anchor → flag

_Illustrative._

```ts
// weird workaround for lint
const [, setForceUpdate] = useState(0);
```

Unchanged. Reported as `needs human rationale`. The discard-`useState` pattern could be papering over a stale-closure bug, an `exhaustive-deps` warning, or a force-render after a ref mutation — without a `// biome-ignore` / `// eslint-disable` pragma to anchor to, the skill cannot upgrade the comment safely.

The right fix is the format already in use at `packages/kit/src/ui/Image/Image.tsx:283` — a `// biome-ignore lint/<rule>: <reason>` directive that names both the lint rule and the reason inline, replacing the vague `// weird workaround for lint` entirely.

## 11. Convert: URL-only comment → `@see {@link …}`

_Illustrative._

```ts
// https://github.com/whatwg/html/issues/9893
function detachShadowRoots() { /* … */ }
```

Rewritten:

```ts
/**
 * @see {@link https://github.com/whatwg/html/issues/9893}
 */
function detachShadowRoots() { /* … */ }
```

Convert. The URL is the entire comment, so the JSDoc has only the `@see {@link …}` line. No title invented — the source did not name one.

## 12. Polish: property restatement → contract (with evidence) or preserved (without)

_Illustrative._

Source:

```ts
interface ProfilerCommit {
    /** The id prop. */
    id: string;
    /** The phase prop. */
    phase: "mount" | "update" | "nested-update";
}
```

**With evidence** — the surrounding file (or referenced source) shows that `id` identifies the React Profiler tree being committed and `phase` distinguishes the kind of commit:

```ts
interface ProfilerCommit {
    /**
     * Identifies which Profiler tree committed. Pass-through of the `id` prop on `<Profiler>`.
     */
    id: string;
    /**
     * Indicates whether the commit is the initial mount, an update, or a nested update batched into the parent commit.
     */
    phase: "mount" | "update" | "nested-update";
}
```

**Without evidence** — the original `// the id prop` and `// the phase prop` are left as written and reported under `Low-value restatements preserved`. Never deleted, never embellished.

## 13. Convert (with evidence) or flag (without): vague callback comment

_Illustrative._

Source:

```ts
// fires on close
onClosed?: (atStep: DepositStateName) => void;
```

When the surrounding code (the dialog's `closed` transition, the `atStep` derivation, the firing site) is visible **and** confirms when the callback fires and what `atStep` carries — for instance, when the source already documents the sibling `onOpened` with the same shape (see example 8) — the rewrite is:

```ts
/**
 * Called when the dialog transitions back to `closed`.
 *
 * @param atStep The last open step before close (e.g. `success`, `error`, `confirmDeposit`) — useful for funnel drop-off attribution.
 */
onClosed?: (atStep: DepositStateName) => void;
```

Without that anchoring code in view, the comment is reported as `Needs human rationale` and left as `// fires on close`. The hover-doc test would fail otherwise — "Called when the dialog closes" adds nothing the symbol name does not already imply.

## 14. Convert: deprecation preserved with `@deprecated`

_Illustrative._

Source:

```ts
// @deprecated use createRoot() — render() is removed in React 18.
function render(node: React.ReactNode, container: Element): void;
```

Rewritten:

```ts
/**
 * @deprecated Use `createRoot()` — `render()` is removed in React 18.
 */
function render(node: React.ReactNode, container: Element): void;
```

Convert. The deprecation message, the recommended replacement, and the version reference are all facts — preserved verbatim. Backticks added around identifier mentions; semantic force untouched.

## 15. Flag: "helper for params"

_Illustrative._

```ts
// helper for params
function buildParams(input: Input): URLSearchParams { /* … */ }
```

Unchanged. Reported as `Needs human rationale`. The phrase is on the reject list and the surrounding code does not name a contract beyond "constructs URLSearchParams from Input" — which the function name and signature already convey. Without local evidence of *why* the helper exists (a normalization rule, an encoding quirk, a backend constraint) the comment cannot be safely upgraded.

## 16. Flag: tempting embellishment with no evidence

_Illustrative._

Source:

```ts
// resolves the next step
async function resolveNextStep(state: DepositState): Promise<DepositStateName> { /* … */ }
```

It is tempting to upgrade this to:

```ts
/**
 * Lets you resolve the next visible step from the orchestrator's current state. Awaits any in-flight transitions and
 * returns the step the dialog should render.
 */
```

But "awaits any in-flight transitions" and "the step the dialog should render" appear nowhere in the original comment, the function signature, or any visible call site. Reported as `Needs human rationale` — the words "awaits", "in-flight", and "should render" are inventions, and the evidence rule forbids them.

The right outcome: leave `// resolves the next step` unchanged, mark for human review.

## 17. Preserve: low-value restatement

_Illustrative._

```ts
class Button {
    // the click handler
    onClick: () => void;
}
```

Unchanged. Reported under `Low-value restatements preserved`. The comment is true but adds nothing the symbol name does not already convey, and the hover-doc test fails: "the click handler" is not better than `onClick: () => void` in a hover popup.

If nearby code showed that `onClick` dispatches a redux action or fires an analytics event, the comment would become eligible for conversion to a contract-defining JSDoc. With no such anchor, it stays as `//`.

## 18. React-style positive shapes (illustrative)

These are target shapes — what a React-style polish looks like at full density. **A real run only produces this density when local evidence backs every clause.**

```ts
/**
 * Lets you read the current selected step without subscribing to orchestrator updates.
 *
 * @returns The step the dialog is currently showing, or `undefined` before the first transition.
 */
function useCurrentStep(): DepositStateName | undefined;

/**
 * Represents the resolved input passed to `onOpened` when the dialog transitions from `closed` to any open step.
 *
 * @template TMethod The deposit method — `"wallet"`, `"transfer"`, or `undefined` for an open-to-picker.
 */
interface ResolvedOpenInput<TMethod extends DepositMethod = DepositMethod> {
    /**
     * The method the dialog opened to. Mirrors the entry-state `method` field after orchestrator resolution.
     */
    method: TMethod;
}

/**
 * Fires after the dialog has resolved its next visible step.
 *
 * @param step The step selected by the orchestrator.
 */
onStepResolved?: (step: DepositStateName) => void;
```

Without local evidence of the no-subscribe semantics, the `undefined`-before-first-transition contract, or the "Mirrors the entry-state" mapping, **none of those clauses can appear**. Anything not visible in the code is forbidden — the skill flags rather than embellishes.

## What would make these rewrites wrong

- Dropping the `from.tx_id` mechanic in #2 to "Race condition with the indexer" — lost the specific field, lost discoverability.
- Dropping the migration note in #3 ("the probe now skips terminal records") — migration notes are kept verbatim.
- Re-ordering the parameter list in the `onOpened` JSDoc in #8 — claim ordering is preserved.
- Inventing "Probably here to force re-render after a ref change" for the discard-`useState` comment in #10 — the evidence rule forbids invented rationale.
- Inventing a title for the URL in #11 (`@see {@link …  HTML Spec issue 9893}`) when the title is not in the source — invented metadata.
- Upgrading the `// the id prop` comment in #12 without surrounding evidence that `id` is a Profiler tree commit identifier — restatement promoted to invented contract.
- Softening `@deprecated Use createRoot() — render() is removed in React 18.` in #14 to "consider createRoot()" — semantic paraphrase that changes certainty.
- Adding `@throws` to the `useCurrentStep` JSDoc in #18 without seeing a `throw` in the function body — invented contract.
