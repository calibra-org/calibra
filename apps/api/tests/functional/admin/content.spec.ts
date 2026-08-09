import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";
import SettingsService from "#services/settings_service";

const CONTENT_URL = "/api/v1/admin/content";

async function createUser(role: "admin" | "customer") {
    const token = randomUUID();
    const user = await User.create({
        email: `content-${role}-${token}@calibra.dev`,
        passwordHash: token,
        role,
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: role === "admin" ? "مدیر" : "مشتری",
        lastName: "محتوا",
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

function richContent(): string {
    const words = Array.from({ length: 560 }, (_, index) => `واژه${index}`).join(" ");
    return `<h2>راهنمای تصمیم‌گیری</h2><p>${words}</p><ul><li>معیار اول</li><li>معیار دوم</li></ul><blockquote>ادعاها باید بازبینی شوند.</blockquote><p><a href="/products">مشاهده محصولات</a></p>`;
}

function postPayload(overrides: Record<string, unknown> = {}) {
    return {
        type: "article",
        locale: "fa",
        title: "راهنمای کامل انتخاب محصول مناسب برای خرید مطمئن",
        excerpt: "این راهنما معیارهای انتخاب، محدودیت‌ها و نکات ضروری پیش از سفارش محصول را با زبان روشن توضیح می‌دهد.",
        content_html: richContent(),
        seo_title: "راهنمای انتخاب محصول مناسب و جلوگیری از خرید اشتباه",
        meta_description:
            "در این راهنمای کاربردی، معیارهای انتخاب محصول، محدودیت‌ها، مقایسه گزینه‌ها و نکات لازم پیش از سفارش را دقیق بررسی می‌کنیم.",
        focus_keyword: "راهنمای انتخاب محصول",
        robots_index: true,
        robots_follow: true,
        schema_type: "BlogPosting",
        status: "draft",
        ...overrides,
    };
}

async function resetContent() {
    await db.rawQuery(`TRUNCATE TABLE
        content_attribution_events,
        content_events,
        content_agent_runs,
        content_revisions,
        content_post_products,
        content_post_tags,
        content_post_categories,
        content_posts,
        content_tags,
        content_categories,
        content_signals,
        content_sources
        RESTART IDENTITY CASCADE`);
    await db.from("settings").where("group_key", "content").delete();
    await new SettingsService().clearCache();
}

test.group("Calibra content operations", (group) => {
    group.each.setup(resetContent);

    test("rejects unauthenticated admin requests", async ({ client }) => {
        const response = await client.get(`${CONTENT_URL}/posts`);
        response.assertStatus(401);
    });

    test("rejects non-admin sessions", async ({ client }) => {
        const customer = await createUser("customer");
        const response = await client.get(`${CONTENT_URL}/posts`).withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("creates, lists, and searches a draft", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const created = await client.post(`${CONTENT_URL}/posts`).withGuard("api").loginAs(admin).json(postPayload());
        created.assertStatus(201);
        assert.equal(created.body().data.status, "draft");
        assert.isAbove(created.body().data.quality_score, 69);

        const list = await client.get(`${CONTENT_URL}/posts`).qs({ q: "خرید مطمئن" }).withGuard("api").loginAs(admin);
        list.assertStatus(200);
        assert.equal(list.body().meta.total, 1);
        assert.equal(list.body().data[0].id, created.body().data.id);
    });

    test("rejects direct creation in a terminal workflow state", async ({ client }) => {
        const admin = await createUser("admin");
        const response = await client
            .post(`${CONTENT_URL}/posts`)
            .withGuard("api")
            .loginAs(admin)
            .json(postPayload({ status: "published" }));
        response.assertStatus(422);
    });

    test("enforces optimistic versioning on updates", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const created = await client.post(`${CONTENT_URL}/posts`).withGuard("api").loginAs(admin).json(postPayload());
        created.assertStatus(201);
        const id = Number(created.body().data.id);
        const body = { ...postPayload({ status: undefined }), title: "نسخه دوم راهنمای انتخاب محصول", expected_version: 1 };
        const first = await client.patch(`${CONTENT_URL}/posts/${id}`).withGuard("api").loginAs(admin).json(body);
        first.assertStatus(200);
        assert.equal(first.body().data.version, 2);

        const stale = await client.patch(`${CONTENT_URL}/posts/${id}`).withGuard("api").loginAs(admin).json(body);
        stale.assertStatus(409);
    });

    test("requires a reviewer before approval", async ({ client }) => {
        const admin = await createUser("admin");
        const created = await client
            .post(`${CONTENT_URL}/posts`)
            .withGuard("api")
            .loginAs(admin)
            .json(postPayload({ status: "in_review" }));
        created.assertStatus(201);
        const response = await client
            .post(`${CONTENT_URL}/posts/${created.body().data.id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "approved", expected_version: 1 });
        response.assertStatus(409);
    });

    test("publishes only through the reviewed workflow and exposes the public article", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const created = await client
            .post(`${CONTENT_URL}/posts`)
            .withGuard("api")
            .loginAs(admin)
            .json(postPayload({ status: "in_review", reviewer_user_id: Number(admin.id) }));
        created.assertStatus(201);
        const id = Number(created.body().data.id);
        const approved = await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "approved", expected_version: 1 });
        approved.assertStatus(200);
        const published = await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "published", expected_version: 2 });
        published.assertStatus(200);
        assert.equal(published.body().data.status, "published");

        const publicList = await client.get("/api/v1/content/posts").qs({ locale: "fa" });
        publicList.assertStatus(200);
        assert.equal(publicList.body().meta.total, 1);
        const publicDetail = await client.get(`/api/v1/content/posts/${published.body().data.slug}`).qs({ locale: "fa" });
        publicDetail.assertStatus(200);
        assert.equal(publicDetail.body().data.id, id);
    });

    test("rejects scheduling in the past", async ({ client }) => {
        const admin = await createUser("admin");
        const created = await client
            .post(`${CONTENT_URL}/posts`)
            .withGuard("api")
            .loginAs(admin)
            .json(postPayload({ status: "in_review", reviewer_user_id: Number(admin.id) }));
        created.assertStatus(201);
        const id = Number(created.body().data.id);
        await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "approved", expected_version: 1 });
        const response = await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "scheduled", expected_version: 2, scheduled_at: "2020-01-01T00:00:00Z" });
        response.assertStatus(422);
    });

    test("deduplicates public views by session", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const created = await client
            .post(`${CONTENT_URL}/posts`)
            .withGuard("api")
            .loginAs(admin)
            .json(postPayload({ status: "in_review", reviewer_user_id: Number(admin.id) }));
        created.assertStatus(201);
        const id = Number(created.body().data.id);
        await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "approved", expected_version: 1 });
        await client
            .post(`${CONTENT_URL}/posts/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ to_status: "published", expected_version: 2 });

        const event = { post_id: id, event_type: "view", session_key: "content-test-session" };
        const first = await client.post("/api/v1/content/events").json(event);
        const second = await client.post("/api/v1/content/events").json(event);
        first.assertStatus(202);
        second.assertStatus(202);
        assert.isTrue(first.body().data.accepted);
        assert.isTrue(second.body().data.deduplicated);
        const detail = await client.get(`${CONTENT_URL}/posts/${id}`).withGuard("api").loginAs(admin);
        assert.equal(detail.body().data.views_count, 1);
    });

    test("prevents category parent cycles", async ({ client }) => {
        const admin = await createUser("admin");
        const first = await client
            .post(`${CONTENT_URL}/taxonomy`)
            .withGuard("api")
            .loginAs(admin)
            .json({ kind: "category", name: "دسته اول" });
        first.assertStatus(201);
        const second = await client
            .post(`${CONTENT_URL}/taxonomy`)
            .withGuard("api")
            .loginAs(admin)
            .json({ kind: "category", name: "دسته دوم", parent_id: first.body().data.id });
        second.assertStatus(201);
        const cycle = await client
            .patch(`${CONTENT_URL}/taxonomy/${first.body().data.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ kind: "category", name: "دسته اول", parent_id: second.body().data.id });
        cycle.assertStatus(422);
    });

    test("deduplicates market signals and converts each signal only once", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const body = {
            title: "رشد جست‌وجوی یک محصول در بازار",
            url: "https://example.com/news/1",
            summary: "یک سیگنال مستند برای بررسی تیم محتوا",
            source_trust_score: 80,
        };
        const first = await client.post(`${CONTENT_URL}/signals`).withGuard("api").loginAs(admin).json(body);
        const duplicate = await client.post(`${CONTENT_URL}/signals`).withGuard("api").loginAs(admin).json(body);
        first.assertStatus(201);
        duplicate.assertStatus(200);
        assert.isTrue(duplicate.body().deduplicated);
        const converted = await client
            .post(`${CONTENT_URL}/signals/${first.body().data.id}/convert`)
            .withGuard("api")
            .loginAs(admin);
        converted.assertStatus(201);
        const repeated = await client
            .post(`${CONTENT_URL}/signals/${first.body().data.id}/convert`)
            .withGuard("api")
            .loginAs(admin);
        repeated.assertStatus(409);
    });

    test("rejects unsafe source URLs", async ({ client }) => {
        const admin = await createUser("admin");
        const response = await client
            .post(`${CONTENT_URL}/sources`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "منبع ناامن", source_type: "rss", feed_url: "file:///etc/passwd" });
        response.assertStatus(422);
    });

    test("validates and persists tenant-scoped content settings", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const response = await client
            .patch(`${CONTENT_URL}/settings`)
            .withGuard("api")
            .loginAs(admin)
            .json({ minimum_publish_quality: 80, allow_agent_publish: false });
        response.assertStatus(200);
        assert.equal(response.body().data.minimum_publish_quality, 80);
        assert.isFalse(response.body().data.allow_agent_publish);
    });

    test("returns dashboard, calendar, and report envelopes", async ({ client, assert }) => {
        const admin = await createUser("admin");
        const summary = await client.get(`${CONTENT_URL}/summary`).withGuard("api").loginAs(admin);
        const calendar = await client.get(`${CONTENT_URL}/calendar`).withGuard("api").loginAs(admin);
        const reports = await client.get(`${CONTENT_URL}/reports`).withGuard("api").loginAs(admin);
        summary.assertStatus(200);
        calendar.assertStatus(200);
        reports.assertStatus(200);
        assert.property(summary.body().data, "totals");
        assert.isArray(calendar.body().data);
        assert.isArray(reports.body().data.monthly);
    });
});
