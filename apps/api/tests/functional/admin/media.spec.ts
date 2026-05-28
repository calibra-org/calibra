import { promises as fs } from "node:fs";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import Media from "#models/media";
import User from "#models/user";

async function createAdmin(email = "admin@media.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function createCustomerUser(email: string) {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

async function truncateMedia() {
    await db.rawQuery(`TRUNCATE TABLE "media" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
}

async function seedRow(
    overrides: Partial<{
        kind: "image" | "file";
        url: string;
        mime: string;
        filename: string;
        title: string;
        alt: string;
        sizeBytes: number;
        createdAt: DateTime;
    }> = {},
): Promise<Media> {
    const row = new Media();
    row.kind = overrides.kind ?? "image";
    row.url = overrides.url ?? "https://example.com/seed.jpg";
    row.mime = overrides.mime ?? "image/jpeg";
    row.filename = overrides.filename ?? "seed.jpg";
    row.title = overrides.title ?? null;
    row.alt = overrides.alt ?? null;
    row.sizeBytes = overrides.sizeBytes ?? 1234;
    row.width = 600;
    row.height = 600;
    row.attributes = {};
    await row.save();
    if (overrides.createdAt !== undefined) {
        await db.from("media").where("id", Number(row.id)).update({ created_at: overrides.createdAt.toISO() });
    }
    return row;
}

test.group("/api/v1/admin/media", (group) => {
    group.each.setup(async () => {
        await truncateMedia();
    });

    test("unauthenticated GET returns 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/media");
        response.assertStatus(401);
    });

    test("non-admin GET returns 403", async ({ client }) => {
        const customer = await createCustomerUser("nope@media.test");
        const response = await client.get("/api/v1/admin/media").withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("admin lists media newest-first", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedRow({ url: "https://example.com/a.jpg", filename: "a.jpg" });
        const newer = await seedRow({ url: "https://example.com/b.jpg", filename: "b.jpg" });

        const response = await client.get("/api/v1/admin/media").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Array<{ id: number; filename: string }>; meta: { total: number } };
        assert.equal(body.data[0]?.id, newer.id);
        assert.equal(body.meta.total, 2);
    });

    test("filters by MIME type group", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedRow({ kind: "image", mime: "image/png", filename: "shot.png" });
        await seedRow({ kind: "file", mime: "application/pdf", filename: "doc.pdf" });
        await seedRow({ kind: "file", mime: "audio/mpeg", filename: "song.mp3" });

        const images = await client.get("/api/v1/admin/media").qs({ type: "image" }).withGuard("api").loginAs(admin);
        images.assertStatus(200);
        images.assertAgainstApiSpec();
        const imageBody = images.body() as { data: Array<{ mime: string }> };
        assert.equal(imageBody.data.length, 1);
        assert.equal(imageBody.data[0]?.mime, "image/png");

        const docs = await client.get("/api/v1/admin/media").qs({ type: "document" }).withGuard("api").loginAs(admin);
        docs.assertStatus(200);
        const docsBody = docs.body() as { data: Array<{ mime: string }> };
        assert.equal(docsBody.data.length, 1);
        assert.equal(docsBody.data[0]?.mime, "application/pdf");
    });

    test("filters by month bucket", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedRow({ createdAt: DateTime.utc(2026, 4, 15), filename: "april.jpg" });
        await seedRow({ createdAt: DateTime.utc(2026, 5, 20), filename: "may.jpg" });
        await seedRow({ createdAt: DateTime.utc(2026, 5, 1), filename: "may-other.jpg" });

        const response = await client.get("/api/v1/admin/media").qs({ month: "2026-05" }).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Array<{ filename: string }> };
        assert.equal(body.data.length, 2);
        const filenames = body.data.map((row) => row.filename).sort();
        assert.deepEqual(filenames, ["may-other.jpg", "may.jpg"]);
    });

    test("search matches filename, title, alt", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedRow({ filename: "winter.jpg", title: "Winter wonderland" });
        await seedRow({ filename: "summer.jpg", title: "Summer day", alt: "winter spirit in summer" });
        await seedRow({ filename: "spring.jpg", title: "Bloom" });

        const response = await client.get("/api/v1/admin/media").qs({ q: "winter" }).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Array<{ filename: string }> };
        assert.equal(body.data.length, 2);
    });

    test("months endpoint returns distinct YYYY-MM buckets", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedRow({ createdAt: DateTime.utc(2026, 5, 1), filename: "a.jpg" });
        await seedRow({ createdAt: DateTime.utc(2026, 5, 28), filename: "b.jpg" });
        await seedRow({ createdAt: DateTime.utc(2025, 12, 5), filename: "c.jpg" });

        const response = await client.get("/api/v1/admin/media/months").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: string[] };
        assert.deepEqual(body.data, ["2026-05", "2025-12"]);
    });

    test("show returns one row", async ({ client, assert }) => {
        const admin = await createAdmin();
        const row = await seedRow({ filename: "one.jpg", title: "One" });

        const response = await client.get(`/api/v1/admin/media/${row.id}`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { id: number; filename: string } };
        assert.equal(body.data.id, row.id);
        assert.equal(body.data.filename, "one.jpg");
    });

    test("show 404s for unknown id", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client.get("/api/v1/admin/media/999999").withGuard("api").loginAs(admin);
        response.assertStatus(404);
        response.assertAgainstApiSpec();
    });

    test("patch updates editable fields", async ({ client, assert }) => {
        const admin = await createAdmin();
        const row = await seedRow({ filename: "before.jpg" });

        const response = await client
            .patch(`/api/v1/admin/media/${row.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ alt: "fresh alt", title: "Fresh title", caption: "  Hello  " });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { alt: string; title: string; caption: string } };
        assert.equal(body.data.alt, "fresh alt");
        assert.equal(body.data.title, "Fresh title");
        assert.equal(body.data.caption, "Hello");
    });

    test("delete removes the row", async ({ client, assert }) => {
        const admin = await createAdmin();
        const row = await seedRow();

        const response = await client.delete(`/api/v1/admin/media/${row.id}`).withGuard("api").loginAs(admin);
        response.assertStatus(204);

        const remaining = await Media.find(row.id);
        assert.isNull(remaining);
    });

    test("upload stores file and returns row", async ({ client, assert }) => {
        const admin = await createAdmin();

        const tmpDir = await fs.mkdtemp("/tmp/media-upload-");
        const tmpFile = `${tmpDir}/hello.txt`;
        await fs.writeFile(tmpFile, "hello world\n", "utf8");

        const response = await client.post("/api/v1/admin/media").withGuard("api").loginAs(admin).file("file", tmpFile);

        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const body = response.body() as {
            data: {
                id: number;
                filename: string;
                kind: string;
                url: string;
                uploaded_by_user_id: number | null;
                size_bytes: number | null;
            };
        };
        assert.equal(body.data.kind, "file");
        assert.equal(body.data.filename, "hello.txt");
        assert.isAbove(body.data.size_bytes ?? 0, 0);
        assert.equal(body.data.uploaded_by_user_id, Number(admin.id));
        assert.match(body.data.url, /\/uploads\/\d{4}\/\d{2}\/[a-f0-9]+\.txt$/);

        await fs.rm(tmpDir, { recursive: true, force: true });

        const persisted = await Media.find(body.data.id);
        assert.isNotNull(persisted);
    });
});
