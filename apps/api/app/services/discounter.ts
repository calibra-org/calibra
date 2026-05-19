import type { Discounter } from "#contracts/discounter";
import DiscounterService from "#services/discounter_service";

/**
 * Single shared {@link Discounter} for the request path. The cart controller and order finalizer
 * resolve the active engine through {@link getDiscounter} so testing seams stay uniform — tests
 * that want the inert variant rebind via {@link setDiscounter} and restore in `afterEach`.
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
