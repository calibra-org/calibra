import { describe, expect, it } from "vitest";

import { type Paginated, type Resource, unwrapPaginated, unwrapResource } from "./envelopes";

describe("envelope helpers", () => {
    it("unwrapResource returns the inner data", () => {
        const envelope: Resource<{ id: number }> = { data: { id: 7 } };
        expect(unwrapResource(envelope)).toEqual({ id: 7 });
    });

    it("unwrapPaginated returns the data array, discarding meta", () => {
        const envelope: Paginated<number> = {
            data: [1, 2, 3],
            meta: { page: 1, limit: 24, total: 3, lastPage: 1 },
        };
        expect(unwrapPaginated(envelope)).toEqual([1, 2, 3]);
    });
});
