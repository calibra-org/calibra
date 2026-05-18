import { test } from "@japa/runner";

test.group("Health probe", () => {
    test("returns 200 with status:ok", async ({ client }) => {
        const response = await client.get("/health");
        response.assertStatus(200);
        response.assertBodyContains({ status: "ok" });
    });
});
