import { test } from "@japa/runner";

import { type CodeRoute, diff, normalisePath, type SpecOperation } from "#commands/check_api_docs";

test.group("check:api-docs diff()", () => {
    test("returns no issues when code and spec match exactly", ({ assert }) => {
        const code: CodeRoute[] = [
            { method: "GET", path: "/api/v1/products" },
            { method: "POST", path: "/api/v1/cart/items" },
        ];
        const spec: SpecOperation[] = [
            { method: "GET", path: "/api/v1/products", operationId: "listProducts" },
            { method: "POST", path: "/api/v1/cart/items", operationId: "cartAddItem" },
        ];

        assert.deepEqual(diff(code, spec), []);
    });

    test("flags endpoints registered in code but missing from spec", ({ assert }) => {
        const code: CodeRoute[] = [
            { method: "GET", path: "/api/v1/products" },
            { method: "POST", path: "/api/v1/admin/secrets" },
        ];
        const spec: SpecOperation[] = [{ method: "GET", path: "/api/v1/products", operationId: "listProducts" }];

        const issues = diff(code, spec);
        assert.lengthOf(issues, 1);
        assert.equal(issues[0]?.severity, "missing-in-spec");
        assert.equal(issues[0]?.codeKey, "POST /api/v1/admin/secrets");
    });

    test("flags spec operations that no longer match any registered route", ({ assert }) => {
        const code: CodeRoute[] = [{ method: "GET", path: "/api/v1/products" }];
        const spec: SpecOperation[] = [
            { method: "GET", path: "/api/v1/products", operationId: "listProducts" },
            { method: "GET", path: "/api/v1/removed-endpoint", operationId: "removedEndpoint" },
        ];

        const issues = diff(code, spec);
        assert.lengthOf(issues, 1);
        assert.equal(issues[0]?.severity, "stale-in-spec");
        assert.equal(issues[0]?.specKey, "GET /api/v1/removed-endpoint");
        assert.include(issues[0]?.message ?? "", "removedEndpoint");
    });

    test("classifies same-path-different-method drift as a single mismatch row", ({ assert }) => {
        const code: CodeRoute[] = [{ method: "PATCH", path: "/api/v1/cart/items/{line}" }];
        const spec: SpecOperation[] = [{ method: "PUT", path: "/api/v1/cart/items/{line}", operationId: "cartUpdateLine" }];

        const issues = diff(code, spec);
        assert.lengthOf(issues, 1);
        assert.equal(issues[0]?.severity, "mismatch");
        assert.equal(issues[0]?.codeKey, "PATCH /api/v1/cart/items/{line}");
        assert.equal(issues[0]?.specKey, "PUT /api/v1/cart/items/{line}");
    });

    test("treats Adonis :slug and OpenAPI {slug} as the same path", ({ assert }) => {
        const code: CodeRoute[] = [{ method: "GET", path: normalisePath("/api/v1/products/:slug") }];
        const spec: SpecOperation[] = [{ method: "GET", path: "/api/v1/products/{slug}", operationId: "showProduct" }];

        assert.deepEqual(diff(code, spec), []);
    });

    test("does not double-report when a path has both methods documented and only one in code", ({ assert }) => {
        const code: CodeRoute[] = [{ method: "GET", path: "/api/v1/cart" }];
        const spec: SpecOperation[] = [
            { method: "GET", path: "/api/v1/cart", operationId: "cartShow" },
            { method: "DELETE", path: "/api/v1/cart", operationId: "cartClear" },
        ];

        const issues = diff(code, spec);
        assert.lengthOf(issues, 1);
        assert.equal(issues[0]?.severity, "stale-in-spec");
        assert.equal(issues[0]?.specKey, "DELETE /api/v1/cart");
    });
});

test.group("normalisePath", () => {
    test("converts Adonis route parameters to OpenAPI templates", ({ assert }) => {
        assert.equal(normalisePath("/api/v1/products/:slug"), "/api/v1/products/{slug}");
        assert.equal(normalisePath("/api/v1/orders/:order_id/refunds/:id"), "/api/v1/orders/{order_id}/refunds/{id}");
    });

    test("strips query strings and trailing slashes", ({ assert }) => {
        assert.equal(normalisePath("/api/v1/products?tree=1"), "/api/v1/products");
        assert.equal(normalisePath("/api/v1/products/"), "/api/v1/products");
    });
});
