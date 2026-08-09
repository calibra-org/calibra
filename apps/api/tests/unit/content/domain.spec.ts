import { test } from "@japa/runner";

import {
    CONTENT_STATUSES,
    calculateContentMetrics,
    canTransitionContent,
    normalizePersian,
    signalFingerprint,
    slugifyContent,
} from "#services/content/domain";
import { isPrivateContentSourceAddress, normalizeContentSourceHostname } from "#services/content/source_ingest_service";

const expectedTransitions: Record<string, readonly string[]> = {
    draft: ["draft", "in_review", "archived"],
    in_review: ["in_review", "draft", "approved", "archived"],
    approved: ["approved", "draft", "scheduled", "published", "archived"],
    scheduled: ["scheduled", "draft", "approved", "published", "archived"],
    published: ["published", "draft", "archived"],
    archived: ["archived", "draft"],
};

test.group("Content lifecycle transition matrix", () => {
    for (const from of CONTENT_STATUSES) {
        for (const to of CONTENT_STATUSES) {
            test(`${from} -> ${to}`, ({ assert }) => {
                assert.equal(canTransitionContent(from, to), expectedTransitions[from]?.includes(to) === true);
            });
        }
    }
});

const normalizationCases = Array.from({ length: 100 }, (_, index) => ({
    input: `  كالا يک ${String(index).padStart(2, "0")}  `,
    expected: `کالا یک ${String(index).padStart(2, "0")}`,
}));

test.group("Persian normalization", () => {
    for (const [index, item] of normalizationCases.entries()) {
        test(`normalizes Persian case ${index + 1}`, ({ assert }) => {
            assert.equal(normalizePersian(item.input), item.expected);
        });
    }
});

test.group("Content slug generation", () => {
    for (let index = 1; index <= 100; index += 1) {
        test(`creates stable safe slug ${index}`, ({ assert }) => {
            const title = `راهنمای انتخاب محصول شماره ${index} / نسخه ۲۰۲۶`;
            const slug = slugifyContent(title);
            assert.equal(slug, `راهنمای-انتخاب-محصول-شماره-${index}-نسخه-2026`);
            assert.notMatch(slug, /\s/);
            assert.isAtMost(slug.length, 191);
        });
    }
});

test.group("Signal fingerprint", () => {
    for (let index = 1; index <= 80; index += 1) {
        test(`is stable and differentiates signal ${index}`, ({ assert }) => {
            const base = {
                url: `https://example.com/news/${index}`,
                title: `خبر شماره ${index}`,
                publishedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T08:00:00Z`,
            };
            const first = signalFingerprint(base);
            const second = signalFingerprint({ ...base });
            const sameUrlWithEditedTitle = signalFingerprint({
                ...base,
                title: `${base.title} ویرایش`,
                url: `${base.url}?utm_source=test#section`,
            });
            const changedUrl = signalFingerprint({ ...base, url: `${base.url}/different` });
            const noUrl = signalFingerprint({ url: null, title: base.title, publishedAt: base.publishedAt });
            const changedNoUrl = signalFingerprint({ url: null, title: `${base.title} ویرایش`, publishedAt: base.publishedAt });
            assert.equal(first, second);
            assert.equal(first, sameUrlWithEditedTitle);
            assert.notEqual(first, changedUrl);
            assert.notEqual(noUrl, changedNoUrl);
            assert.lengthOf(first, 64);
        });
    }
});

test.group("Content source network safety", () => {
    const blocked = [
        "127.0.0.1",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.1.1",
        "::1",
        "::",
        "fc00::1",
        "fe80::1",
        "ff02::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "::ffff:0a00:1",
        "100.64.0.1",
        "192.0.0.1",
        "198.18.0.1",
        "64:ff9b::7f00:1",
        "100::1",
        "2001::1",
        "2001:db8::1",
        "2002:7f00:1::",
    ];
    for (const address of blocked) {
        test(`blocks private address ${address}`, ({ assert }) => {
            assert.isTrue(isPrivateContentSourceAddress(address));
        });
    }
    for (const address of ["93.184.216.34", "2606:4700:4700::1111"]) {
        test(`allows public address ${address}`, ({ assert }) => {
            assert.isFalse(isPrivateContentSourceAddress(address));
        });
    }
});

test.group("Content source hostname normalization", () => {
    for (const [input, expected] of [
        ["[::1]", "::1"],
        ["[2606:4700:4700::1111]", "2606:4700:4700::1111"],
        ["Example.COM.", "example.com"],
        ["127.0.0.1", "127.0.0.1"],
    ] as const) {
        test(`normalizes source hostname ${input}`, ({ assert }) => {
            assert.equal(normalizeContentSourceHostname(input), expected);
        });
    }
});

test.group("Content quality metrics", () => {
    for (let index = 1; index <= 80; index += 1) {
        test(`keeps scores bounded and deterministic ${index}`, ({ assert }) => {
            const words = Array.from({ length: 200 + index * 5 }, (_, word) => `کلمه${word}`).join(" ");
            const input = {
                title: `راهنمای کامل و دقیق انتخاب محصول کشاورزی شماره ${index}`,
                excerpt: "این خلاصه برای کمک به تصمیم‌گیری دقیق و جلوگیری از انتخاب اشتباه پیش از خرید نوشته شده است.",
                contentHtml: `<h2>راهنمای انتخاب</h2><p>${words}</p><ul><li>مقایسه</li><li>قیمت</li></ul><a href="/products">مشاهده محصول</a>`,
                seoTitle: `راهنمای انتخاب محصول شماره ${index}`,
                metaDescription:
                    "این راهنما معیارهای انتخاب، محدودیت‌ها، مقایسه گزینه‌ها و نکات لازم پیش از سفارش محصول را به‌صورت دقیق و قابل بررسی توضیح می‌دهد.",
                focusKeyword: "راهنمای انتخاب",
                featuredMediaId: index,
                categoryIds: [1],
                productIds: index % 2 === 0 ? [1, 2] : [1],
                canonicalUrl: `https://example.com/mag/guide-${index}`,
            };
            const first = calculateContentMetrics(input);
            const second = calculateContentMetrics(input);
            assert.deepEqual(first, second);
            assert.isAtLeast(first.wordCount, 200);
            assert.isAtLeast(first.readingTimeMinutes, 1);
            for (const score of [first.seoScore, first.qualityScore, first.commerceScore]) {
                assert.isAtLeast(score, 0);
                assert.isAtMost(score, 100);
            }
        });
    }
});
