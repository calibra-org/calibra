import type { Discounter } from "#contracts/discounter";
import DiscounterService from "#services/discounter_service";

/**
 * Single shared {@link Discounter} for the request path. Phase 04 wired the cart through
 * {@link NoopDiscounter}; this module replaces that reference. Importers that need the active
 * engine (cart controller, phase 05's order finalizer) should pull `discounter` from here rather
 * than instantiating their own — keeps testing seams uniform (any test that wants the no-op
 * variant rebinds via {@link setDiscounter}).
 */
let active: Discounter = new DiscounterService();

export function getDiscounter(): Discounter {
    return active;
}

/**
 * Swap the active discounter (tests + bootstrap only). Returns the previous binding so the caller
 * can restore it cleanly in an `afterEach`. The runtime never reads from a stale closure — the
 * singleton is read every call via {@link getDiscounter}.
 */
export function setDiscounter(next: Discounter): Discounter {
    const previous = active;
    active = next;
    return previous;
}
