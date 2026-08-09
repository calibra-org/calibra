import type { SeoEvidence, SeoSiteSettings } from "#services/seo/domain";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const joinUrl = (base: string, path: string) => `${stripTrailingSlash(base)}/${path.replace(/^\/+/, "")}`;

export interface RobotsRule {
    userAgent: string;
    allow?: string[];
    disallow?: string[];
}

export interface RobotsDocument {
    rules: RobotsRule[];
    sitemap: string[];
    host?: string;
}

export function buildRobotsDocument(settings: SeoSiteSettings): RobotsDocument {
    if (!settings.robots_enabled) return { rules: [{ userAgent: "*", disallow: ["/"] }], sitemap: [] };
    const common: RobotsRule = {
        userAgent: "*",
        allow: settings.robots_allow_all ? ["/"] : undefined,
        disallow: settings.robots_disallow.filter(Boolean),
    };
    const rules: RobotsRule[] = [common];
    rules.push(
        settings.openai_searchbot_allowed
            ? { userAgent: "OAI-SearchBot", allow: ["/"], disallow: settings.robots_disallow.filter(Boolean) }
            : { userAgent: "OAI-SearchBot", disallow: ["/"] },
    );
    const base = stripTrailingSlash(settings.base_url);
    return { rules, sitemap: settings.sitemap_enabled && base ? [joinUrl(base, "/sitemap.xml")] : [], host: base || undefined };
}

export function serializeRobots(document: RobotsDocument): string {
    const blocks = document.rules.map((rule) => {
        const lines = [`User-agent: ${rule.userAgent}`];
        for (const allow of rule.allow ?? []) lines.push(`Allow: ${allow}`);
        for (const disallow of rule.disallow ?? []) lines.push(`Disallow: ${disallow}`);
        return lines.join("\n");
    });
    for (const sitemap of document.sitemap) blocks.push(`Sitemap: ${sitemap}`);
    if (document.host) blocks.push(`Host: ${document.host}`);
    return `${blocks.join("\n\n")}\n`;
}

export interface SitemapEntry {
    url: string;
    lastModified?: string | null;
    changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    priority?: number;
    images?: string[];
}

export function filterSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
    const unique = new Map<string, SitemapEntry>();
    for (const entry of entries) {
        if (!/^https?:\/\//i.test(entry.url)) continue;
        const current = unique.get(entry.url);
        if (!current || String(entry.lastModified ?? "") > String(current.lastModified ?? ""))
            unique.set(entry.url, { ...entry, images: [...new Set(entry.images ?? [])] });
    }
    return [...unique.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function chunkSitemapEntries(entries: SitemapEntry[], size = 50_000): SitemapEntry[][] {
    if (!Number.isInteger(size) || size < 1 || size > 50_000) throw new Error("Sitemap chunk size must be between 1 and 50000");
    const filtered = filterSitemapEntries(entries);
    const chunks: SitemapEntry[][] = [];
    for (let index = 0; index < filtered.length; index += size) chunks.push(filtered.slice(index, index + size));
    return chunks;
}

function compact<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(
            ([, item]) => item !== null && item !== undefined && item !== "" && (!Array.isArray(item) || item.length > 0),
        ),
    ) as T;
}

export function buildEntitySchema(evidence: SeoEvidence, settings: SeoSiteSettings): Record<string, unknown> | null {
    if (!settings.schema_enabled || evidence.profile?.robotsIndex === false) return null;
    const canonical = evidence.profile?.canonicalUrl || evidence.publicUrl || undefined;
    const title = evidence.profile?.metaTitle || evidence.title || undefined;
    const description = evidence.profile?.metaDescription || evidence.shortDescription || evidence.description || undefined;
    let schema: Record<string, unknown>;

    if (evidence.kind === "product") {
        const offer =
            evidence.priceMinor === null || evidence.priceMinor === undefined
                ? undefined
                : compact({
                      "@type": "Offer",
                      priceCurrency: "IRR",
                      price: evidence.priceMinor,
                      availability:
                          evidence.stockStatus === "outofstock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
                      itemCondition: "https://schema.org/NewCondition",
                      url: canonical,
                  });
        schema = compact({
            "@context": "https://schema.org",
            "@type": evidence.variationCount && evidence.variationCount > 0 ? "ProductGroup" : "Product",
            "@id": canonical ? `${canonical}#product` : undefined,
            name: title,
            description,
            url: canonical,
            image: evidence.imageUrls?.length
                ? evidence.imageUrls
                : evidence.featuredImageUrl
                  ? [evidence.featuredImageUrl]
                  : undefined,
            sku: evidence.sku || undefined,
            gtin: evidence.gtin || undefined,
            brand: evidence.brandName ? { "@type": "Brand", name: evidence.brandName } : undefined,
            category: evidence.categoryNames?.length ? evidence.categoryNames.join(" > ") : undefined,
            productGroupID: evidence.variationCount && evidence.variationCount > 0 ? evidence.sku || evidence.key : undefined,
            variesBy:
                evidence.variationCount && evidence.variationCount > 0 && evidence.attributeCount
                    ? "https://schema.org/additionalProperty"
                    : undefined,
            offers: offer,
            additionalProperty: evidence.attributeCount
                ? [{ "@type": "PropertyValue", name: "attributeCount", value: evidence.attributeCount }]
                : undefined,
        });
    } else if (evidence.kind === "content_post") {
        schema = compact({
            "@context": "https://schema.org",
            "@type": evidence.profile?.schemaType || "BlogPosting",
            "@id": canonical ? `${canonical}#article` : undefined,
            mainEntityOfPage: canonical,
            headline: title,
            description,
            image: evidence.featuredImageUrl ? [evidence.featuredImageUrl] : undefined,
            datePublished: evidence.publishedAt || undefined,
            dateModified: evidence.updatedAt || undefined,
            author: evidence.authorName
                ? { "@type": "Person", name: evidence.authorName }
                : evidence.authorId
                  ? { "@type": "Person", identifier: String(evidence.authorId) }
                  : undefined,
            publisher: settings.organization_name
                ? {
                      "@type": "Organization",
                      name: settings.organization_name,
                      logo: settings.organization_logo_url || undefined,
                  }
                : undefined,
        });
    } else if (evidence.kind === "category" || evidence.kind === "brand") {
        schema = compact({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": canonical,
            name: title,
            description,
            url: canonical,
            mainEntity: evidence.productCount ? { "@type": "ItemList", numberOfItems: evidence.productCount } : undefined,
        });
    } else if (evidence.kind === "media") {
        schema = compact({
            "@context": "https://schema.org",
            "@type": "ImageObject",
            "@id": canonical ? `${canonical}#image` : undefined,
            name: title,
            description,
            contentUrl: evidence.publicUrl || undefined,
            width: evidence.imageWidth || undefined,
            height: evidence.imageHeight || undefined,
            encodingFormat: evidence.mime || undefined,
        });
    } else {
        schema = compact({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": canonical,
            name: title,
            description,
            url: canonical,
        });
    }

    return compact({ ...schema, ...(evidence.profile?.schemaOverrides ?? {}) });
}

export function buildOrganizationSchema(settings: SeoSiteSettings): Record<string, unknown> | null {
    if (!settings.schema_enabled || !settings.base_url || !settings.organization_name) return null;
    return compact({
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${stripTrailingSlash(settings.base_url)}#organization`,
        name: settings.organization_name,
        url: stripTrailingSlash(settings.base_url),
        logo: settings.organization_logo_url || undefined,
    });
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export function serializeSitemapXml(entries: SitemapEntry[]): string {
    const body = filterSitemapEntries(entries)
        .map((entry) => {
            const images = (entry.images ?? [])
                .map((image) => `<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`)
                .join("");
            const fields = [
                `<loc>${escapeXml(entry.url)}</loc>`,
                entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : "",
                entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : "",
                entry.priority === undefined ? "" : `<priority>${Math.max(0, Math.min(1, entry.priority)).toFixed(1)}</priority>`,
                images,
            ].join("");
            return `<url>${fields}</url>`;
        })
        .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;
}
