import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Produces `dist/_merged.test.json`, a single OpenAPI document that fuses the
 * bundled storefront and admin specs. The Japa `@japa/openapi-assertions`
 * plugin validates each response against one schema document, so we materialise
 * a merged artefact at test time instead of teaching the plugin about two
 * roots.
 *
 * The hand-authored specs are OAS 3.1, but the underlying validator
 * (`api-contract-validator` → `api-schema-builder`) only understands OAS 3.0.
 * We therefore rewrite the merged document into a 3.0-compatible shape — most
 * notably collapsing `type: ["X", "null"]` into `type: "X", nullable: true`.
 * Public consumers still bundle the original 3.1 specs separately; this file
 * is gitignored test-only scaffolding.
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

const storefront = JSON.parse(await readFile(resolve(ROOT, "dist/storefront.v1.json"), "utf8"));
const admin = JSON.parse(await readFile(resolve(ROOT, "dist/admin.v1.json"), "utf8"));
const platform = JSON.parse(await readFile(resolve(ROOT, "dist/platform.v1.json"), "utf8"));

const surfaces = [storefront, admin, platform];
const seenPaths = new Set();
for (const surface of surfaces) {
    for (const path of Object.keys(surface.paths ?? {})) {
        if (seenPaths.has(path)) {
            throw new Error(`Path collision across surfaces — "${path}" is defined more than once. Investigate before merging.`);
        }
        seenPaths.add(path);
    }
}

const mergeComponent = (key) => Object.assign({}, ...surfaces.map((surface) => surface.components?.[key] ?? {}));

const merged = {
    openapi: "3.0.3",
    info: { title: "Calibra API (test-only merge)", version: "0.0.0" },
    servers: storefront.servers ?? admin.servers ?? platform.servers ?? [],
    paths: { ...storefront.paths, ...admin.paths, ...platform.paths },
    components: {
        schemas: mergeComponent("schemas"),
        responses: mergeComponent("responses"),
        parameters: mergeComponent("parameters"),
        requestBodies: mergeComponent("requestBodies"),
        headers: mergeComponent("headers"),
        securitySchemes: mergeComponent("securitySchemes"),
    },
};

downgradeTo30(merged, merged);

const outPath = resolve(ROOT, "dist/_merged.test.json");
await writeFile(outPath, JSON.stringify(merged, null, 2));
console.log(`✓ Wrote ${outPath} (${Object.keys(merged.paths).length} paths)`);

/**
 * Recursively rewrites OAS 3.1 idioms into the OAS 3.0 equivalents the
 * api-contract-validator expects. Walks every node; transforms in place.
 *
 * Conversions:
 *   - `type: ["X", "null"]` (3.1 nullable shorthand) becomes `type: "X", nullable: true`.
 *   - `anyOf` / `oneOf` containing a `{ type: "null" }` branch sheds the null branch and
 *     marks the parent `nullable: true`; if the combinator collapses to a single member, it
 *     is hoisted into the parent so the validator sees a Schema rather than an empty `anyOf`.
 *     When the surviving member is a `$ref`, the referenced schema is *resolved and inlined*
 *     rather than wrapped in `allOf: [{$ref}]` — `api-contract-validator@2.2.8` does not
 *     process `allOf + nullable: true` correctly, so a flat inlined object is the only shape
 *     it accepts.
 *   - Schema-level `examples: [v, …]` (3.1) becomes `example: v` — Media-Type-level
 *     `examples` (which is a Map<name, ExampleObject> in both 3.0 and 3.1) is left alone,
 *     distinguished by Array vs Object shape.
 *   - `$ref` with sibling properties (3.1) is wrapped in `allOf: [{ $ref }]` so the
 *     siblings live outside the Reference Object (3.0 forbids `$ref` siblings).
 *
 * Add further down-conversions here if the hand-authored spec adopts more 3.1-only constructs.
 *
 * @param {unknown} node — any JSON-typed value reachable from the OAS document.
 * @param {unknown} root — the full merged OAS document, used to resolve `$ref` pointers.
 */
function downgradeTo30(node, root) {
    if (Array.isArray(node)) {
        for (const child of node) downgradeTo30(child, root);
        return;
    }
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node.type)) {
        const types = node.type;
        const nonNull = types.filter((t) => t !== "null");
        const hasNull = types.includes("null");
        if (nonNull.length === 1) {
            node.type = nonNull[0];
            if (hasNull) node.nullable = true;
        }
    }

    for (const key of ["anyOf", "oneOf"]) {
        if (!Array.isArray(node[key])) continue;
        const original = node[key];
        const filtered = original.filter((s) => !(s && typeof s === "object" && s.type === "null"));
        const hadNull = filtered.length !== original.length;
        if (!hadNull) continue;
        if (filtered.length === 0) {
            delete node[key];
            node.nullable = true;
            continue;
        }
        if (filtered.length === 1) {
            const only = filtered[0];
            delete node[key];
            if (typeof only.$ref === "string") {
                const resolved = resolveRef(only.$ref, root);
                if (resolved && typeof resolved === "object") {
                    /**
                     * `api-contract-validator` mishandles `allOf` + `nullable: true` — it applies the
                     * allOf constraints even to a `null` value. Flatten an inlined allOf-of-objects
                     * into a single object so a nullable customer/profile validates as either null or
                     * the merged object shape.
                     */
                    Object.assign(node, flattenAllOf(deepClone(resolved), root));
                    node.nullable = true;
                    continue;
                }
            }
            Object.assign(node, only);
        } else {
            node[key] = filtered;
        }
        node.nullable = true;
    }

    if (node.examples !== undefined) {
        if (Array.isArray(node.examples)) {
            if (node.example === undefined && node.examples.length > 0) {
                node.example = node.examples[0];
            }
        }
        delete node.examples;
    }

    if (typeof node.$ref === "string" && Object.keys(node).length > 1) {
        const ref = node.$ref;
        delete node.$ref;
        node.allOf = [{ $ref: ref }, ...(Array.isArray(node.allOf) ? node.allOf : [])];
    }

    for (const value of Object.values(node)) downgradeTo30(value, root);
}

/**
 * Resolves a local JSON-pointer `$ref` (e.g. `#/components/schemas/Foo`) against the
 * merged document. Returns the referenced node or `null` when the pointer is external or
 * cannot be navigated. Only handles the form Redocly's bundler produces — no fragment
 * escaping (`~0`/`~1`) is needed because component names are simple identifiers.
 */
function resolveRef(ref, root) {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
    const segments = ref.slice(2).split("/");
    let cursor = root;
    for (const segment of segments) {
        if (!cursor || typeof cursor !== "object") return null;
        cursor = cursor[segment];
    }
    return cursor ?? null;
}

/** Structural clone for plain JSON nodes. The merged spec is JSON, so this is enough. */
function deepClone(node) {
    return JSON.parse(JSON.stringify(node));
}

/**
 * Collapse an `allOf` of object schemas into one flat object (merging `properties` + `required`,
 * resolving `$ref` members). Used so a nullable inlined `$ref` to an allOf-based schema (e.g.
 * `CustomerProfile`) validates under `api-contract-validator`, which does not honour
 * `allOf` + `nullable: true` together. Non-allOf schemas are returned unchanged.
 */
function flattenAllOf(schema, root) {
    if (!schema || typeof schema !== "object" || !Array.isArray(schema.allOf)) {
        return schema;
    }
    const merged = { type: "object", properties: {}, required: [] };
    const members = [...schema.allOf];
    for (const [key, value] of Object.entries(schema)) {
        if (key !== "allOf") members.push({ [key]: value });
    }
    for (const rawMember of members) {
        let member = rawMember;
        if (typeof member.$ref === "string") {
            member = resolveRef(member.$ref, root) ?? {};
        }
        member = flattenAllOf(deepClone(member), root);
        if (member.properties) Object.assign(merged.properties, member.properties);
        if (Array.isArray(member.required)) merged.required.push(...member.required);
        for (const [key, value] of Object.entries(member)) {
            if (key === "properties" || key === "required" || key === "type" || key === "allOf") continue;
            merged[key] = value;
        }
    }
    if (merged.required.length === 0) delete merged.required;
    return merged;
}
