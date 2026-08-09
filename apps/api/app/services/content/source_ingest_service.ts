import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { contentService } from "#services/content/content_service";
import { normalizePersian, signalFingerprint } from "#services/content/domain";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface FeedItem {
    title: string;
    url: string | null;
    summary: string | null;
    publishedAt: string | null;
    externalId: string | null;
}

type DbRow = Record<string, unknown>;

function affectedRows(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return 0;
        if (value.length === 1) return Number(value[0] ?? 0);
        return value.length;
    }
    return Number(value ?? 0);
}

function bounded(value: string | null, maxLength: number): string | null {
    if (!value) return null;
    return value.slice(0, maxLength);
}

function decodeXml(value: string): string {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function capture(block: string, names: string[]): string | null {
    for (const name of names) {
        const paired = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block)?.[1];
        if (paired) return decodeXml(paired);
        const href = new RegExp(`<${name}(?:\\s[^>]*)?href=["']([^"']+)["'][^>]*\\/?>(?:<\\/${name}>)?`, "i").exec(block)?.[1];
        if (href) return decodeXml(href);
    }
    return null;
}

function normalizeFeedUrl(value: string | null, baseUrl: URL): string | null {
    if (!value) return null;
    try {
        const resolved = new URL(value, baseUrl);
        return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
    } catch {
        return null;
    }
}

function parseFeed(xml: string, baseUrl: URL): FeedItem[] {
    const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2] ?? "");
    return blocks.slice(0, 100).flatMap((block) => {
        const title = bounded(capture(block, ["title"]), 500);
        if (!title) return [];
        const url = normalizeFeedUrl(capture(block, ["link", "guid"]), baseUrl);
        const summary = bounded(capture(block, ["description", "summary", "content:encoded", "content"]), 10_000);
        const published = capture(block, ["pubDate", "published", "updated", "dc:date"]);
        const parsed = published ? DateTime.fromRFC2822(published, { setZone: true }) : DateTime.invalid("not-rfc");
        const iso = parsed.isValid
            ? parsed.toUTC().toISO()
            : published
              ? DateTime.fromISO(published, { setZone: true }).toUTC().toISO()
              : null;
        return [{ title, url, summary, publishedAt: iso, externalId: bounded(capture(block, ["guid", "id"]), 255) }];
    });
}

function ipv6Hextets(value: string): number[] | null {
    let address = value.toLowerCase().split("%")[0] ?? "";
    if (!address.includes(":")) return null;
    const ipv4Match = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
    if (ipv4Match) {
        const octets = ipv4Match[1].split(".").map(Number);
        if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
        const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
        address = address.slice(0, address.length - ipv4Match[1].length) + replacement;
    }
    if ((address.match(/::/g) ?? []).length > 1) return null;
    const [leftRaw, rightRaw = ""] = address.split("::");
    const left = leftRaw ? leftRaw.split(":") : [];
    const right = rightRaw ? rightRaw.split(":") : [];
    if (!address.includes("::") && left.length !== 8) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (address.includes("::") && missing < 1)) return null;
    const values = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
    if (values.length !== 8 || values.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
    return values.map((part) => Number.parseInt(part, 16));
}

function embeddedIpv4(hextets: number[]): string {
    return `${hextets[6] >> 8}.${hextets[6] & 255}.${hextets[7] >> 8}.${hextets[7] & 255}`;
}

export function isPrivateContentSourceAddress(address: string): boolean {
    const normalized = address.toLowerCase().split("%")[0] ?? "";
    if (isIP(normalized) === 4) {
        const parts = normalized.split(".").map(Number);
        const [a = 0, b = 0] = parts;
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 0) ||
            (a === 192 && b === 168) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }
    if (isIP(normalized) !== 6) return true;
    const hextets = ipv6Hextets(normalized);
    if (!hextets) return true;
    const allZeroBeforeTail = hextets.slice(0, 6).every((part) => part === 0);
    if (allZeroBeforeTail) {
        if (hextets[6] === 0 && (hextets[7] === 0 || hextets[7] === 1)) return true;
        return isPrivateContentSourceAddress(embeddedIpv4(hextets));
    }
    const ipv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
    if (ipv4Mapped) return isPrivateContentSourceAddress(embeddedIpv4(hextets));
    const first = hextets[0];
    return (
        (first >= 0xfc00 && first <= 0xfdff) ||
        (first >= 0xfe80 && first <= 0xfeff) ||
        (first >= 0xff00 && first <= 0xffff) ||
        (first === 0x0064 && hextets[1] === 0xff9b) ||
        (first === 0x0100 && hextets[1] === 0) ||
        (first === 0x2001 && hextets[1] === 0) ||
        (first === 0x2001 && hextets[1] === 0x0002) ||
        (first === 0x2001 && hextets[1] === 0x0db8) ||
        first === 0x2002
    );
}

interface ResolvedPublicUrl {
    url: URL;
    address: string;
    family: number;
}

export function normalizeContentSourceHostname(value: string): string {
    return value.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

async function assertPublicUrl(value: string): Promise<ResolvedPublicUrl> {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Exception("Source URL is invalid", { status: 422, code: "E_CONTENT_SOURCE_URL" });
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Exception("Only HTTP(S) source URLs are allowed", { status: 422, code: "E_CONTENT_SOURCE_URL" });
    }
    if (url.username || url.password) {
        throw new Exception("Source URLs cannot contain credentials", { status: 422, code: "E_CONTENT_SOURCE_URL" });
    }
    const hostname = normalizeContentSourceHostname(url.hostname);
    if (
        ["localhost", "localhost.localdomain"].includes(hostname) ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
    ) {
        throw new Exception("Private source URLs are blocked", { status: 422, code: "E_CONTENT_SOURCE_PRIVATE" });
    }
    let addresses: Array<{ address: string; family: number }>;
    try {
        const directFamily = isIP(hostname);
        addresses = directFamily
            ? [{ address: hostname, family: directFamily }]
            : await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new Exception("Source hostname could not be resolved", { status: 422, code: "E_CONTENT_SOURCE_DNS" });
    }
    if (addresses.length === 0) {
        throw new Exception("Source hostname could not be resolved", { status: 422, code: "E_CONTENT_SOURCE_DNS" });
    }
    if (addresses.some((entry) => isPrivateContentSourceAddress(entry.address))) {
        throw new Exception("Private source URLs are blocked", { status: 422, code: "E_CONTENT_SOURCE_PRIVATE" });
    }
    const selected = addresses[0];
    if (!selected) throw new Exception("Source hostname could not be resolved", { status: 422, code: "E_CONTENT_SOURCE_DNS" });
    return { url, address: selected.address, family: selected.family };
}

async function requestLimitedXml(target: ResolvedPublicUrl, maxBytes: number): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const pinnedLookup = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
            if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
            else callback(null, target.address, target.family);
        }) as LookupFunction;
        const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
        const request = transport(
            target.url,
            {
                method: "GET",
                lookup: pinnedLookup,
                headers: {
                    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
                    "user-agent": "CalibraContentMonitor/1.0 (+tenant-managed-feed-reader)",
                },
            },
            (response) => {
                const status = response.statusCode ?? 0;
                if (status >= 300 && status < 400) {
                    response.resume();
                    reject(new Error("source redirects are not allowed"));
                    return;
                }
                if (status < 200 || status >= 300) {
                    response.resume();
                    reject(new Error(`source returned HTTP ${status}`));
                    return;
                }
                const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
                if (
                    contentType &&
                    !contentType.includes("xml") &&
                    !contentType.includes("rss") &&
                    !contentType.includes("atom")
                ) {
                    response.resume();
                    reject(new Error(`source returned unsupported content type: ${contentType.slice(0, 120)}`));
                    return;
                }
                const contentLength = Number(response.headers["content-length"] ?? 0);
                if (contentLength > maxBytes) {
                    response.resume();
                    reject(new Error(`source response exceeds ${Math.floor(maxBytes / 1_000_000)} MB`));
                    return;
                }
                const chunks: Uint8Array[] = [];
                let total = 0;
                response.on("data", (chunk: Uint8Array) => {
                    total += chunk.byteLength;
                    if (total > maxBytes) {
                        request.destroy(new Error(`source response exceeds ${Math.floor(maxBytes / 1_000_000)} MB`));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
                response.on("error", reject);
            },
        );
        request.setTimeout(15_000, () => request.destroy(new Error("source request timed out")));
        request.on("error", reject);
        request.end();
    });
}

function scoreItem(item: FeedItem, source: DbRow): { relevance: number; opportunity: number; risk: number } {
    const text = normalizePersian(`${item.title} ${item.summary ?? ""}`).toLowerCase();
    const rawTopics =
        typeof source.topics === "string"
            ? (() => {
                  try {
                      return JSON.parse(source.topics) as unknown;
                  } catch {
                      return [];
                  }
              })()
            : source.topics;
    const topics = Array.isArray(rawTopics) ? rawTopics.map(String) : [];
    const matches = topics.filter((topic) => text.includes(normalizePersian(topic).toLowerCase())).length;
    const relevance = Math.min(100, topics.length === 0 ? 50 : 25 + Math.round((matches / Math.max(1, topics.length)) * 75));
    const freshness = item.publishedAt
        ? Math.max(0, 30 - Math.floor(DateTime.utc().diff(DateTime.fromISO(item.publishedAt), "days").days))
        : 10;
    const opportunity = Math.min(100, Math.round(relevance * 0.7 + freshness));
    const riskWords = ["ادعا", "قطعی", "تضمین", "درمان", "پزشکی", "قانون", "مالی", "شایعه"];
    const risk = Math.min(100, riskWords.filter((word) => text.includes(word)).length * 20);
    return { relevance, opportunity, risk };
}

export interface PreparedContentSourceIngestion {
    sourceId: number;
    source: DbRow;
    feedUrl: string;
}

export interface ContentSourceFetchResult {
    items: FeedItem[];
    fetchedFrom: string;
}

export async function prepareContentSourceIngestion(sourceId: number): Promise<PreparedContentSourceIngestion | null> {
    const trx = currentTrx();
    const settings = await contentService.settings();
    if (!settings.source_fetch_enabled)
        throw new Exception("Source fetching is disabled", { status: 409, code: "E_CONTENT_SOURCE_FETCH_DISABLED" });
    const source = (await trx.from("content_sources").where("id", sourceId).first()) as DbRow | undefined;
    if (!source) throw new Exception("Content source not found", { status: 404, code: "E_NOT_FOUND" });
    if (source.status === "paused")
        throw new Exception("Content source is paused", { status: 409, code: "E_CONTENT_SOURCE_PAUSED" });
    if (!["rss", "atom"].includes(String(source.source_type)))
        throw new Exception("Only RSS or Atom sources can be fetched automatically", {
            status: 422,
            code: "E_CONTENT_SOURCE_TYPE_UNSUPPORTED",
        });
    const feedUrl = typeof source.feed_url === "string" ? source.feed_url : null;
    if (!feedUrl) throw new Exception("Source has no feed URL", { status: 422, code: "E_CONTENT_SOURCE_FEED_REQUIRED" });

    const staleBefore = DateTime.utc().minus({ minutes: 5 }).toISO();
    const claimed = (await trx
        .from("content_sources")
        .where("id", sourceId)
        .where((query) =>
            query
                .whereIn("status", ["active", "error"])
                .orWhere((stale) => stale.where("status", "fetching").where("updated_at", "<", staleBefore)),
        )
        .update({ status: "fetching", updated_at: DateTime.utc().toISO() })
        .returning("*")) as DbRow[];
    const claimedSource = claimed[0];
    if (!claimedSource) return null;
    return { sourceId, source: claimedSource, feedUrl };
}

export async function requestContentSource(prepared: PreparedContentSourceIngestion): Promise<ContentSourceFetchResult> {
    const target = await assertPublicUrl(prepared.feedUrl);
    const xml = await requestLimitedXml(target, 2_000_000);
    const items = parseFeed(xml, target.url);
    if (items.length === 0) throw new Error("no RSS/Atom entries found");
    return { items, fetchedFrom: target.url.toString() };
}

export async function completeContentSourceIngestion(
    prepared: PreparedContentSourceIngestion,
    fetched: ContentSourceFetchResult,
): Promise<{ inserted: number; deduplicated: number }> {
    const trx = currentTrx();
    const source = prepared.source;
    let inserted = 0;
    let deduplicated = 0;
    for (const item of fetched.items) {
        const fingerprint = signalFingerprint({ url: item.url, title: item.title, publishedAt: item.publishedAt });
        const scores = scoreItem(item, source);
        const insertedRows = await trx
            .table("content_signals")
            .insert({
                tenant_id: String(currentTenantId()),
                source_id: prepared.sourceId,
                external_id: item.externalId,
                url: item.url,
                title: item.title,
                summary: item.summary,
                language: "fa",
                fingerprint,
                source_trust_score: Number(source.trust_score ?? 50),
                business_relevance_score: scores.relevance,
                opportunity_score: scores.opportunity,
                risk_score: scores.risk,
                sentiment: "neutral",
                published_at: item.publishedAt,
                metadata: JSON.stringify({ ingestion: "rss_atom", fetched_from: fetched.fetchedFrom }),
            })
            .onConflict(["tenant_id", "fingerprint"])
            .ignore()
            .returning("id");
        if (insertedRows.length > 0) inserted += 1;
        else deduplicated += 1;
    }
    const interval = Number(source.crawl_interval_minutes ?? 360);
    const updated = await trx
        .from("content_sources")
        .where("id", prepared.sourceId)
        .where("status", "fetching")
        .update({
            status: "active",
            last_fetched_at: DateTime.utc().toISO(),
            next_fetch_at: DateTime.utc().plus({ minutes: interval }).toISO(),
            error_count: 0,
            last_error: null,
            updated_at: DateTime.utc().toISO(),
        });
    if (affectedRows(updated) === 0)
        throw new Exception("Content source state changed during ingestion", {
            status: 409,
            code: "E_CONTENT_SOURCE_STATE_CHANGED",
        });
    return { inserted, deduplicated };
}

export async function failContentSourceIngestion(sourceId: number, error: unknown): Promise<void> {
    const trx = currentTrx();
    await trx
        .from("content_sources")
        .where("id", sourceId)
        .where("status", "fetching")
        .update({
            status: "error",
            error_count: trx.raw("error_count + 1"),
            last_error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
            next_fetch_at: DateTime.utc().plus({ hours: 6 }).toISO(),
            updated_at: DateTime.utc().toISO(),
        });
}

export async function ingestContentSource(sourceId: number): Promise<{ inserted: number; deduplicated: number }> {
    const prepared = await prepareContentSourceIngestion(sourceId);
    if (!prepared) return { inserted: 0, deduplicated: 0 };
    try {
        const fetched = await requestContentSource(prepared);
        return await completeContentSourceIngestion(prepared, fetched);
    } catch (error) {
        await failContentSourceIngestion(sourceId, error);
        throw new Exception("Content source ingestion failed", { status: 502, code: "E_CONTENT_SOURCE_FETCH", cause: error });
    }
}
