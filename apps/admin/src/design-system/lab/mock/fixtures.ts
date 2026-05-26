/**
 * Fixtures for showcase demos. Every list/picker/combobox demo pulls from these instead of
 * hitting the real API — keeps the showcase deterministic and self-contained. Names mix
 * Persian and English so the demos stress-test RTL flips, font fallbacks, and digit rendering.
 * Money values are in minor units (rial); Toman = rial / 10.
 *
 * Adding a fixture:
 *   1. Pick a shape that mirrors the real API shape for the resource.
 *   2. Aim for 25–50 rows — enough to exercise scroll / pagination, not so many that the demo
 *      page is heavy.
 *   3. Mix Persian and English names; include believable SKUs / phone numbers / addresses.
 */

export interface MockProduct {
    id: number;
    name: string;
    sku: string | null;
    priceMinor: number;
    imageUrl: string | null;
    status: "draft" | "published" | "archived";
}

export interface MockCategory {
    id: number;
    name: string;
    slug: string;
    parentId: number | null;
}

export interface MockBrand {
    id: number;
    name: string;
    slug: string;
    imageUrl: string | null;
}

export interface MockCustomer {
    id: number;
    displayName: string;
    email: string;
    phone: string;
    locale: "fa" | "en";
}

export interface MockOrder {
    id: number;
    number: string;
    status: "pending" | "processing" | "completed" | "cancelled" | "refunded" | "on_hold" | "failed";
    totalMinor: number;
    createdAt: string;
    customerId: number;
}

export interface MockCoupon {
    id: number;
    code: string;
    status: "active" | "scheduled" | "expired" | "disabled";
    discountKind: "percent" | "fixed_cart" | "fixed_product";
    valueMinor: number;
}

const productsRaw: Array<[string, string, number]> = [
    ["هدفون بی‌سیم سامسونگ", "SMS-HP-001", 4_500_000],
    ["Apple AirPods Pro 2", "APL-APP-002", 28_500_000],
    ["گوشی شیائومی Redmi Note 13", "XMI-RN13-003", 96_000_000],
    ["Samsung Galaxy S24 Ultra", "SMS-S24U-004", 245_000_000],
    ["لپ‌تاپ ایسوس Vivobook 15", "ASU-VB15-005", 188_000_000],
    ["MacBook Air M3 13″", "APL-MBA-006", 412_000_000],
    ["مانیتور ال‌جی 27 اینچ 4K", "LG-MN27-007", 95_500_000],
    ["Dell UltraSharp 32 4K", "DLL-US32-008", 175_000_000],
    ["کیبورد مکانیکی کیچرون K6", "KCH-K6-009", 18_400_000],
    ["Logitech MX Keys S", "LGI-MXKS-010", 32_000_000],
    ["ماوس بی‌سیم Logitech MX Master 3S", "LGI-MXM3-011", 36_500_000],
    ["Razer DeathAdder V3 Pro", "RZR-DA3-012", 42_800_000],
    ["پاوربانک انکر 20000mAh", "ANK-PB20-013", 8_900_000],
    ["Anker GaNPrime 100W Charger", "ANK-GP100-014", 14_200_000],
    ["ساعت هوشمند شیائومی Mi Band 8", "XMI-MB8-015", 6_700_000],
    ["Apple Watch Series 10 GPS 42mm", "APL-AW10-016", 168_000_000],
    ["دوربین مدارسته Eufy 2K", "EUF-CAM2K-017", 22_500_000],
    ["Sony WH-1000XM5 Noise Cancelling", "SNY-XM5-018", 144_000_000],
    ["اسپیکر بلوتوث JBL Flip 6", "JBL-FLP6-019", 19_800_000],
    ["Bose QuietComfort Ultra", "BSE-QCU-020", 198_000_000],
    ["تبلت سامسونگ Galaxy Tab S9 FE", "SMS-TS9F-021", 142_000_000],
    ["iPad Air 11″ M3 256GB", "APL-IPA-022", 268_000_000],
    ["پرینتر اچ‌پی LaserJet M404n", "HP-LJ404-023", 78_500_000],
    ["Brother HL-L2390DW", "BRO-L2390-024", 64_200_000],
    ["روتر تی‌پی-لینک Archer AX73", "TPL-AX73-025", 26_500_000],
    ["Asus ROG Rapture GT-AX11000", "ASU-AX11K-026", 142_000_000],
    ["میکروفون Blue Yeti USB", "BLU-YETI-027", 28_900_000],
    ["Shure MV7+ Podcast Microphone", "SHR-MV7P-028", 86_400_000],
    ["وب‌کم Logitech C920 HD", "LGI-C920-029", 14_500_000],
    ["Elgato Facecam Pro 4K60", "ELG-FCP-030", 124_000_000],
    ["پایه مانیتور Ergotron LX", "ERG-LX-031", 38_900_000],
    ["Herman Miller Aeron Size B", "HMR-AER-032", 1_980_000_000],
    ["صندلی گیمینگ DXRacer Master", "DXR-MAS-033", 89_500_000],
    ["IKEA Markus Office Chair", "IKE-MRK-034", 124_000_000],
    ["میز گیمینگ Arozzi Arena", "ARZ-ARN-035", 78_400_000],
    ["Flexispot E7 Standing Desk", "FXP-E7-036", 198_000_000],
    ["چراغ مطالعه BenQ ScreenBar", "BNQ-SCB-037", 32_500_000],
    ["Philips Hue White Starter Kit", "PHL-HUE-038", 56_800_000],
    ["دستگاه قهوه‌ساز De'Longhi Magnifica", "DEL-MAG-039", 192_000_000],
    ["Breville Barista Express Impress", "BRV-BEI-040", 412_000_000],
    ["آسیاب قهوه Baratza Encore ESP", "BRZ-ESP-041", 96_000_000],
    ["Fellow Stagg EKG Electric Kettle", "FEL-EKG-042", 88_500_000],
    ["ترازوی آشپزخانه Etekcity", "ETK-KIT-043", 4_900_000],
    ["Anova Precision Cooker 3.0", "ANV-PC3-044", 84_000_000],
    ["دوچرخه Trek Marlin 7", "TRK-MR7-045", 312_000_000],
    ["Specialized Sirrus X 2.0", "SPC-SRX-046", 248_000_000],
    ["جوراب Smartwool Hike", "SWL-HIK-047", 7_800_000],
    ["Patagonia Better Sweater Fleece", "PAT-BSW-048", 142_000_000],
    ["کفش دویدن Hoka Clifton 9", "HKA-CL9-049", 96_500_000],
    ["Nike Pegasus 41", "NKE-PG41-050", 84_000_000],
];

export const mockProducts: MockProduct[] = productsRaw.map(([name, sku, priceMinor], i) => ({
    id: i + 1,
    name,
    sku,
    priceMinor,
    imageUrl: `https://picsum.photos/seed/product-${i + 1}/120/120`,
    status: i % 7 === 0 ? "draft" : i % 11 === 0 ? "archived" : "published",
}));

const categoriesRaw: Array<[string, string, number | null]> = [
    ["الکترونیک", "electronics", null],
    ["گوشی و تبلت", "phones-tablets", 1],
    ["لپ‌تاپ و کامپیوتر", "laptops-computers", 1],
    ["صدا و تصویر", "audio-video", 1],
    ["لوازم جانبی", "accessories", 1],
    ["مد و پوشاک", "fashion", null],
    ["لباس مردانه", "mens-clothing", 6],
    ["لباس زنانه", "womens-clothing", 6],
    ["کفش و کیف", "shoes-bags", 6],
    ["خانه و آشپزخانه", "home-kitchen", null],
    ["مبلمان", "furniture", 10],
    ["دکوراسیون", "decor", 10],
    ["لوازم آشپزخانه", "kitchenware", 10],
    ["لوازم آشپزی", "cookware", 13],
    ["ورزش و سرگرمی", "sports-hobbies", null],
    ["دوچرخه و اسکوتر", "bikes-scooters", 15],
    ["پوشاک ورزشی", "sportswear", 15],
    ["کوهنوردی و کمپ", "outdoor-camping", 15],
    ["کتاب و رسانه", "books-media", null],
    ["کتاب فارسی", "persian-books", 19],
    ["English Books", "english-books", 19],
    ["موسیقی و فیلم", "music-films", 19],
    ["زیبایی و سلامت", "beauty-health", null],
    ["مراقبت پوست", "skincare", 23],
    ["مکمل غذایی", "supplements", 23],
];

export const mockCategories: MockCategory[] = categoriesRaw.map(([name, slug, parentId], i) => ({
    id: i + 1,
    name,
    slug,
    parentId,
}));

const brandsRaw: string[] = [
    "Samsung",
    "Apple",
    "Xiaomi",
    "Asus",
    "Dell",
    "LG",
    "Sony",
    "Bose",
    "Logitech",
    "Razer",
    "Anker",
    "Eufy",
    "JBL",
    "HP",
    "Brother",
    "TP-Link",
    "Shure",
    "Elgato",
    "Herman Miller",
    "DXRacer",
];

export const mockBrands: MockBrand[] = brandsRaw.map((name, i) => ({
    id: i + 1,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    imageUrl: `https://picsum.photos/seed/brand-${i + 1}/80/80`,
}));

const customersRaw: Array<[string, string, string, "fa" | "en"]> = [
    ["علی رضایی", "ali.rezaei@example.com", "+989121234567", "fa"],
    ["زهرا کریمی", "zahra.karimi@example.com", "+989121234568", "fa"],
    ["محمد حسینی", "mohammad.hosseini@example.com", "+989121234569", "fa"],
    ["فاطمه احمدی", "fatemeh.ahmadi@example.com", "+989121234570", "fa"],
    ["Sara Mitchell", "sara.mitchell@example.com", "+14155550101", "en"],
    ["Daniel Romero", "daniel.romero@example.com", "+14155550102", "en"],
    ["نگار صالحی", "negar.salehi@example.com", "+989121234571", "fa"],
    ["پویا تقوی", "pouya.taghavi@example.com", "+989121234572", "fa"],
    ["Olivia Bennett", "olivia.bennett@example.com", "+14155550103", "en"],
    ["James O'Connor", "james.oconnor@example.com", "+14155550104", "en"],
    ["مریم نوری", "maryam.nouri@example.com", "+989121234573", "fa"],
    ["رضا میرزایی", "reza.mirzaei@example.com", "+989121234574", "fa"],
    ["Aisha Khan", "aisha.khan@example.com", "+447700900101", "en"],
    ["Lucas Müller", "lucas.muller@example.com", "+4915123456789", "en"],
    ["سحر فرهادی", "sahar.farhadi@example.com", "+989121234575", "fa"],
    ["امیر صادقی", "amir.sadeghi@example.com", "+989121234576", "fa"],
    ["Priya Patel", "priya.patel@example.com", "+447700900102", "en"],
    ["Henrik Larsson", "henrik.larsson@example.com", "+46701234567", "en"],
    ["بهاره ملکی", "bahareh.maleki@example.com", "+989121234577", "fa"],
    ["نوید رحمانی", "navid.rahmani@example.com", "+989121234578", "fa"],
    ["Camille Dubois", "camille.dubois@example.com", "+33612345678", "en"],
    ["Mateo García", "mateo.garcia@example.com", "+34612345678", "en"],
    ["لاله ابراهیمی", "laleh.ebrahimi@example.com", "+989121234579", "fa"],
    ["کاوه حقیقی", "kaveh.haghighi@example.com", "+989121234580", "fa"],
    ["Hannah Schmidt", "hannah.schmidt@example.com", "+4915123456790", "en"],
    ["Ivan Petrov", "ivan.petrov@example.com", "+74951234567", "en"],
    ["مهسا کاظمی", "mahsa.kazemi@example.com", "+989121234581", "fa"],
    ["آرش زمانی", "arash.zamani@example.com", "+989121234582", "fa"],
    ["Sofia Rossi", "sofia.rossi@example.com", "+393331234567", "en"],
    ["Noah Becker", "noah.becker@example.com", "+4915123456791", "en"],
    ["شیما خسروی", "shima.khosravi@example.com", "+989121234583", "fa"],
    ["یاسمن عابدی", "yasaman.abedi@example.com", "+989121234584", "fa"],
    ["Aria Walsh", "aria.walsh@example.com", "+61412345678", "en"],
    ["Kai Watanabe", "kai.watanabe@example.com", "+819012345678", "en"],
    ["مهدی موسوی", "mehdi.mousavi@example.com", "+989121234585", "fa"],
    ["پرنیا قاسمی", "parnia.ghasemi@example.com", "+989121234586", "fa"],
    ["Elena Vasquez", "elena.vasquez@example.com", "+525512345678", "en"],
    ["Tomás Fernández", "tomas.fernandez@example.com", "+541123456789", "en"],
    ["ساسان قنبری", "sasan.ghanbari@example.com", "+989121234587", "fa"],
    ["شایان امیری", "shayan.amiri@example.com", "+989121234588", "fa"],
];

export const mockCustomers: MockCustomer[] = customersRaw.map(([displayName, email, phone, locale], i) => ({
    id: i + 1,
    displayName,
    email,
    phone,
    locale,
}));

const orderStatuses = ["pending", "processing", "completed", "cancelled", "refunded", "on_hold", "failed"] as const;

export const mockOrders: MockOrder[] = Array.from({ length: 30 }).map((_, i) => {
    const status = orderStatuses[i % orderStatuses.length]!;
    const dayOffset = i * 2 + (i % 3);
    return {
        id: i + 1,
        number: `ORD-${String(10042 + i).padStart(5, "0")}`,
        status,
        totalMinor: (i + 1) * 12_500_000 + (i % 5) * 3_750_000,
        createdAt: new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString(),
        customerId: (i % mockCustomers.length) + 1,
    };
});

const couponsRaw: Array<[string, MockCoupon["status"], MockCoupon["discountKind"], number]> = [
    ["NOWRUZ-1403", "active", "percent", 25],
    ["WELCOME10", "active", "percent", 10],
    ["FREESHIP", "active", "fixed_cart", 2_500_000],
    ["SUMMER-25", "expired", "percent", 25],
    ["VIP-AUDIO", "active", "fixed_product", 5_000_000],
    ["BLACKFRIDAY", "scheduled", "percent", 40],
    ["YALDA-1404", "scheduled", "percent", 30],
    ["LOYALTY-50K", "active", "fixed_cart", 50_000_000],
    ["BACK2SCHOOL", "expired", "percent", 15],
    ["STUDENT-DSC", "active", "percent", 12],
    ["BUNDLE-3", "disabled", "fixed_cart", 8_000_000],
    ["FIRST-ORDER", "active", "percent", 20],
    ["EARLYBIRD-9", "expired", "percent", 9],
    ["FLASH-30", "scheduled", "percent", 30],
    ["CLEAROUT-10", "active", "fixed_product", 1_500_000],
];

export const mockCoupons: MockCoupon[] = couponsRaw.map(([code, status, discountKind, valueMinor], i) => ({
    id: i + 1,
    code,
    status,
    discountKind,
    valueMinor,
}));
