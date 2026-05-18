/**
 * In-memory mock fixtures for every admin domain. Realistic Persian + English content so the
 * panel renders convincingly without a backend.
 *
 * Money is in **Rial minor units** per the ADR. Toman display is `value / 10` and happens in the
 * formatter, not here.
 */

import type {
    AdminAttribute,
    AdminAttributeTerm,
    AdminBrand,
    AdminCategory,
    AdminCoupon,
    AdminCustomer,
    AdminOrder,
    AdminPaymentGateway,
    AdminProduct,
    AdminRefund,
    AdminReview,
    AdminSettingsGroup,
    AdminShippingMethod,
    AdminShippingZone,
    AdminShippingZoneMethod,
    AdminTag,
    AdminTaxClass,
    AdminTaxRate,
    OrderStatus,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Catalog                                                                   */
/* -------------------------------------------------------------------------- */

export const categories: AdminCategory[] = [
    {
        id: 1,
        parentId: null,
        name: { fa: "پوشاک", en: "Apparel" },
        slug: { fa: "apparel", en: "apparel" },
        productCount: 18,
        imageUrl: null,
    },
    {
        id: 2,
        parentId: 1,
        name: { fa: "تی‌شرت", en: "T-Shirts" },
        slug: { fa: "tshirts", en: "tshirts" },
        productCount: 8,
        imageUrl: null,
    },
    {
        id: 3,
        parentId: 1,
        name: { fa: "هودی", en: "Hoodies" },
        slug: { fa: "hoodies", en: "hoodies" },
        productCount: 4,
        imageUrl: null,
    },
    {
        id: 4,
        parentId: null,
        name: { fa: "الکترونیک", en: "Electronics" },
        slug: { fa: "electronics", en: "electronics" },
        productCount: 14,
        imageUrl: null,
    },
    {
        id: 5,
        parentId: 4,
        name: { fa: "هدفون", en: "Headphones" },
        slug: { fa: "headphones", en: "headphones" },
        productCount: 6,
        imageUrl: null,
    },
    {
        id: 6,
        parentId: 4,
        name: { fa: "موس و کیبورد", en: "Mice & Keyboards" },
        slug: { fa: "mice-keyboards", en: "mice-keyboards" },
        productCount: 5,
        imageUrl: null,
    },
    {
        id: 7,
        parentId: null,
        name: { fa: "لوازم خانه", en: "Home Goods" },
        slug: { fa: "home", en: "home" },
        productCount: 11,
        imageUrl: null,
    },
    {
        id: 8,
        parentId: null,
        name: { fa: "کتاب", en: "Books" },
        slug: { fa: "books", en: "books" },
        productCount: 9,
        imageUrl: null,
    },
];

export const tags: AdminTag[] = [
    { id: 1, name: { fa: "جدید", en: "New" }, slug: { fa: "new", en: "new" }, productCount: 12 },
    { id: 2, name: { fa: "تخفیف ویژه", en: "Sale" }, slug: { fa: "sale", en: "sale" }, productCount: 7 },
    { id: 3, name: { fa: "پرفروش", en: "Bestseller" }, slug: { fa: "bestseller", en: "bestseller" }, productCount: 9 },
    { id: 4, name: { fa: "محدود", en: "Limited" }, slug: { fa: "limited", en: "limited" }, productCount: 3 },
];

export const brands: AdminBrand[] = [
    { id: 1, name: { fa: "کالیبرا", en: "Calibra" }, slug: { fa: "calibra", en: "calibra" }, productCount: 12, logoUrl: null },
    {
        id: 2,
        name: { fa: "نوین‌گستر", en: "Novin Gostar" },
        slug: { fa: "novin-gostar", en: "novin-gostar" },
        productCount: 8,
        logoUrl: null,
    },
    { id: 3, name: { fa: "آرا", en: "Ara" }, slug: { fa: "ara", en: "ara" }, productCount: 5, logoUrl: null },
    { id: 4, name: { fa: "پاسارگاد", en: "Pasargad" }, slug: { fa: "pasargad", en: "pasargad" }, productCount: 4, logoUrl: null },
];

export const attributes: AdminAttribute[] = [
    { id: 1, code: "size", name: { fa: "سایز", en: "Size" }, termCount: 4, orderBy: "menu_order", hasArchives: true },
    { id: 2, code: "color", name: { fa: "رنگ", en: "Color" }, termCount: 6, orderBy: "name", hasArchives: true },
    { id: 3, code: "material", name: { fa: "جنس", en: "Material" }, termCount: 5, orderBy: "name", hasArchives: false },
];

export const attributeTerms: AdminAttributeTerm[] = [
    { id: 1, attributeId: 1, name: { fa: "S", en: "S" }, slug: "s" },
    { id: 2, attributeId: 1, name: { fa: "M", en: "M" }, slug: "m" },
    { id: 3, attributeId: 1, name: { fa: "L", en: "L" }, slug: "l" },
    { id: 4, attributeId: 1, name: { fa: "XL", en: "XL" }, slug: "xl" },
    { id: 5, attributeId: 2, name: { fa: "مشکی", en: "Black" }, slug: "black" },
    { id: 6, attributeId: 2, name: { fa: "سفید", en: "White" }, slug: "white" },
    { id: 7, attributeId: 2, name: { fa: "قرمز", en: "Red" }, slug: "red" },
    { id: 8, attributeId: 2, name: { fa: "آبی", en: "Blue" }, slug: "blue" },
    { id: 9, attributeId: 2, name: { fa: "خاکستری", en: "Gray" }, slug: "gray" },
    { id: 10, attributeId: 2, name: { fa: "سبز", en: "Green" }, slug: "green" },
    { id: 11, attributeId: 3, name: { fa: "نخ", en: "Cotton" }, slug: "cotton" },
    { id: 12, attributeId: 3, name: { fa: "پلی‌استر", en: "Polyester" }, slug: "polyester" },
    { id: 13, attributeId: 3, name: { fa: "چرم", en: "Leather" }, slug: "leather" },
    { id: 14, attributeId: 3, name: { fa: "آلومینیوم", en: "Aluminum" }, slug: "aluminum" },
    { id: 15, attributeId: 3, name: { fa: "پلاستیک", en: "Plastic" }, slug: "plastic" },
];

const productNamesFa = [
    "تی‌شرت کلاسیک پنبه‌ای",
    "هودی زمستانی پشمی",
    "هدفون بی‌سیم نویز کنسلر",
    "ماگ سرامیکی دست‌ساز",
    "دفترچه یادداشت چرمی",
    "کیبورد مکانیکی RGB",
    "ساعت رومیزی مینیمال",
    "کوله‌پشتی مسافرتی",
    "گوشواره نقره",
    "عینک آفتابی پولاریزه",
    "کتاب «هزار و یک شب»",
    "گلدان سرامیکی",
    "شارژر فست ۶۵ وات",
    "پاوربانک ۲۰۰۰۰",
    "کفش ورزشی سبک",
    "اسپیکر بلوتوث قابل حمل",
];

const productNamesEn = [
    "Classic Cotton Tee",
    "Winter Wool Hoodie",
    "Wireless Noise-Cancelling Headphones",
    "Handmade Ceramic Mug",
    "Leather Notebook",
    "RGB Mechanical Keyboard",
    "Minimal Desk Clock",
    "Travel Backpack",
    "Silver Earrings",
    "Polarized Sunglasses",
    "Book — One Thousand and One Nights",
    "Ceramic Vase",
    "65W Fast Charger",
    "20000 mAh Power Bank",
    "Lightweight Running Shoes",
    "Portable Bluetooth Speaker",
];

const productImagePalette = [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
    "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
    "https://images.unsplash.com/photo-1481349518771-20055b2a7b24?w=400",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=400",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400",
];

export const products: AdminProduct[] = productNamesFa.map((nameFa, index) => {
    const id = index + 1;
    const nameEn = productNamesEn[index] ?? `Sample Product ${id}`;
    const regularRial = (50_000 + index * 37_000 + ((index * 13) % 100) * 1_000) * 10;
    const onSale = index % 4 === 0;
    const stockManaged = index % 5 !== 0;
    const stockQty = stockManaged ? Math.max(0, 80 - index * 5 + ((index * 7) % 30)) : null;
    const stockStatus = stockQty === null || stockQty > 0 ? "instock" : "outofstock";
    return {
        id,
        sku: `SKU-${(1000 + id).toString()}`,
        type: index % 6 === 0 ? "variable" : "simple",
        status: index % 11 === 0 ? "draft" : "publish",
        name: { fa: nameFa, en: nameEn },
        slug: { fa: `mahsool-${id}`, en: `product-${id}` },
        shortDescription: {
            fa: "توضیح کوتاه و گویا درباره ویژگی‌های اصلی این محصول.",
            en: "Concise summary highlighting the key features of this product.",
        },
        regularPrice: regularRial,
        salePrice: onSale ? Math.round(regularRial * 0.85) : null,
        stockQuantity: stockQty,
        stockStatus,
        manageStock: stockManaged,
        featured: index % 7 === 0,
        categoryIds: [(index % 3) + 1, ((index + 2) % 7) + 1],
        brandId: ((index % brands.length) + 1) as number,
        tagIds: index % 3 === 0 ? [1, 3] : index % 2 === 0 ? [2] : [],
        imageUrl: productImagePalette[index % productImagePalette.length] ?? null,
        weightGrams: index % 3 === 0 ? null : 200 + index * 30,
        createdAt: new Date(2026, 3, 20 - (index % 18)).toISOString(),
        updatedAt: new Date(2026, 4, 16 - (index % 14)).toISOString(),
    };
});

export const reviews: AdminReview[] = [
    {
        id: 1,
        productId: 1,
        productName: products[0]!.name,
        reviewerName: "سارا م.",
        reviewerEmail: "sara.m@example.ir",
        rating: 5,
        body: "کیفیت پارچه عالی بود، اندازه دقیق و رنگ کاملاً مطابق تصویر.",
        status: "approved",
        verified: true,
        createdAt: "2026-05-12T09:24:00Z",
    },
    {
        id: 2,
        productId: 3,
        productName: products[2]!.name,
        reviewerName: "رضا ک.",
        reviewerEmail: "reza.k@example.ir",
        rating: 4,
        body: "کیفیت صدا عالی، فقط جای نگه دارنده هد می‌توانست راحت‌تر باشد.",
        status: "approved",
        verified: true,
        createdAt: "2026-05-11T18:02:00Z",
    },
    {
        id: 3,
        productId: 5,
        productName: products[4]!.name,
        reviewerName: "نیلوفر ر.",
        reviewerEmail: "niloo.r@example.ir",
        rating: 5,
        body: "بسیار حرفه‌ای و خوش‌دست. هدیه فوق‌العاده‌ای شد.",
        status: "pending",
        verified: false,
        createdAt: "2026-05-15T07:10:00Z",
    },
    {
        id: 4,
        productId: 7,
        productName: products[6]!.name,
        reviewerName: "Mahdi A.",
        reviewerEmail: "mahdi.a@example.com",
        rating: 3,
        body: "خوب است، اما با تصویر سایت کمی تفاوت رنگ دارد.",
        status: "pending",
        verified: true,
        createdAt: "2026-05-14T11:32:00Z",
    },
    {
        id: 5,
        productId: 9,
        productName: products[8]!.name,
        reviewerName: "Spam Bot",
        reviewerEmail: "noise@spam.example",
        rating: 1,
        body: "Click here for free crypto.",
        status: "spam",
        verified: false,
        createdAt: "2026-05-10T03:01:00Z",
    },
];

/* -------------------------------------------------------------------------- */
/*  Customers                                                                 */
/* -------------------------------------------------------------------------- */

const customerSeed: Pick<AdminCustomer, "id" | "firstName" | "lastName" | "email" | "phone" | "nationalId" | "companyName">[] = [
    {
        id: 1,
        firstName: "سارا",
        lastName: "محمدی",
        email: "sara.mohammadi@example.ir",
        phone: "+989121234567",
        nationalId: "0079876543",
        companyName: null,
    },
    {
        id: 2,
        firstName: "رضا",
        lastName: "کریمی",
        email: "reza.karimi@example.ir",
        phone: "+989124445566",
        nationalId: "0066123456",
        companyName: null,
    },
    {
        id: 3,
        firstName: "نیلوفر",
        lastName: "رضایی",
        email: "niloofar.r@example.ir",
        phone: "+989122223344",
        nationalId: "0064523456",
        companyName: "آرا دیزاین",
    },
    {
        id: 4,
        firstName: "Mahdi",
        lastName: "Akbari",
        email: "mahdi.akbari@example.com",
        phone: "+989125556677",
        nationalId: null,
        companyName: null,
    },
    {
        id: 5,
        firstName: "زهرا",
        lastName: "حسینی",
        email: "zahra.h@example.ir",
        phone: "+989128887766",
        nationalId: "0071234567",
        companyName: null,
    },
    {
        id: 6,
        firstName: "علی",
        lastName: "صادقی",
        email: "ali.s@example.ir",
        phone: "+989121119988",
        nationalId: "0062345678",
        companyName: "پاسارگاد تجارت",
    },
    {
        id: 7,
        firstName: "Yasamin",
        lastName: "Tehrani",
        email: "yasamin.t@example.com",
        phone: "+989353332211",
        nationalId: null,
        companyName: null,
    },
    {
        id: 8,
        firstName: "حمید",
        lastName: "نجفی",
        email: "hamid.n@example.ir",
        phone: "+989357776655",
        nationalId: "0072345678",
        companyName: null,
    },
];

export const customers: AdminCustomer[] = customerSeed.map((seed, index) => {
    const ordersCount = 2 + ((index * 3) % 7);
    const totalSpent = (250_000 + index * 180_000) * 10;
    return {
        ...seed,
        userId: seed.id,
        isPayingCustomer: ordersCount > 0,
        ordersCount,
        totalSpent,
        lastOrderAt: new Date(2026, 4, 17 - (index % 12)).toISOString(),
        createdAt: new Date(2025, 8, 4 + index).toISOString(),
        addresses: [
            {
                id: index * 2 + 1,
                kind: "both",
                label: "خانه",
                firstName: seed.firstName,
                lastName: seed.lastName,
                company: seed.companyName,
                addressLine1: `خیابان ولیعصر، پلاک ${100 + index * 7}`,
                addressLine2: null,
                city: index % 3 === 0 ? "تهران" : index % 3 === 1 ? "اصفهان" : "شیراز",
                provinceCode: index % 3 === 0 ? "TEH" : index % 3 === 1 ? "ESF" : "FAR",
                postcode: `1${(987654 + index).toString()}${(10 + index).toString().slice(0, 3)}`.slice(0, 10),
                country: "IR",
                phone: seed.phone,
                isDefault: true,
            },
        ],
        downloads:
            index === 0
                ? [
                      {
                          id: 1,
                          productName: { fa: "راهنمای دیجیتال خرید", en: "Buyer's Digital Guide" },
                          orderNumber: 1042,
                          grantedAt: "2026-05-12T09:24:00Z",
                          expiresAt: "2026-08-12T09:24:00Z",
                          downloadLimit: 5,
                          downloadsUsed: 1,
                      },
                  ]
                : [],
    };
});

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

const orderStatusPool: OrderStatus[] = [
    "pending",
    "processing",
    "on_hold",
    "completed",
    "completed",
    "completed",
    "cancelled",
    "refunded",
    "failed",
];

export const orders: AdminOrder[] = Array.from({ length: 24 }).map((_, index) => {
    const id = 1000 + index;
    const orderNumber = 2000 + index;
    const customer = customers[index % customers.length]!;
    const status = orderStatusPool[index % orderStatusPool.length]!;
    const productSlice = products.slice(index % 4, (index % 4) + 2 + (index % 3));
    const lineItems = productSlice.map((product, lineIndex) => {
        const qty = 1 + (lineIndex % 3);
        const unit = product.salePrice ?? product.regularPrice;
        const subtotal = unit * qty;
        const tax = Math.round(subtotal * 0.1);
        return {
            id: id * 10 + lineIndex,
            productId: product.id,
            name: product.name,
            sku: product.sku,
            quantity: qty,
            unitPrice: unit,
            subtotal,
            taxTotal: tax,
            total: subtotal + tax,
            imageUrl: product.imageUrl,
        };
    });
    const itemsTotal = lineItems.reduce((acc, line) => acc + line.subtotal, 0);
    const itemsTax = lineItems.reduce((acc, line) => acc + line.taxTotal, 0);
    const shippingTotal = index % 5 === 0 ? 0 : 800_000;
    const shippingTax = Math.round(shippingTotal * 0.1);
    const discount = index % 3 === 0 ? 200_000 : 0;
    const taxTotal = itemsTax + shippingTax;
    const grandTotal = itemsTotal + shippingTotal + taxTotal - discount;
    const placedAt = new Date(2026, 4, 17 - (index % 14), 9 + (index % 12), (index * 11) % 60).toISOString();
    const paidAt = status === "pending" || status === "draft" || status === "failed" ? null : placedAt;
    return {
        id,
        orderNumber,
        orderKey: `ok_${id}_${Math.random().toString(36).slice(2, 10)}`,
        status,
        customerId: customer.id,
        customerName: `${customer.firstName} ${customer.lastName}`,
        billingEmail: customer.email,
        currency: "IRR",
        currencyDisplay: "IRT",
        grandTotal,
        itemsTotal,
        shippingTotal,
        discountTotal: discount,
        taxTotal,
        paymentMethodTitle: index % 4 === 0 ? { fa: "پرداخت در محل", en: "Cash on delivery" } : { fa: "زرین‌پال", en: "ZarinPal" },
        createdAt: placedAt,
        paidAt,
        completedAt: status === "completed" ? placedAt : null,
        billingAddress: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            company: customer.companyName,
            addressLine1: customer.addresses[0]?.addressLine1 ?? "خیابان آزادی، پلاک ۱۲",
            addressLine2: null,
            city: customer.addresses[0]?.city ?? "تهران",
            provinceCode: customer.addresses[0]?.provinceCode ?? "TEH",
            postcode: customer.addresses[0]?.postcode ?? "1419773111",
            country: "IR",
            phone: customer.phone,
            nationalId: customer.nationalId,
        },
        shippingAddress: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            company: null,
            addressLine1: customer.addresses[0]?.addressLine1 ?? "خیابان آزادی، پلاک ۱۲",
            addressLine2: null,
            city: customer.addresses[0]?.city ?? "تهران",
            provinceCode: customer.addresses[0]?.provinceCode ?? "TEH",
            postcode: customer.addresses[0]?.postcode ?? "1419773111",
            country: "IR",
            phone: customer.phone,
            nationalId: customer.nationalId,
        },
        lineItems,
        shippingLines:
            shippingTotal > 0
                ? [{ id: id * 100, methodTitle: { fa: "پست پیشتاز", en: "Post Pishtaz" }, total: shippingTotal }]
                : [{ id: id * 100, methodTitle: { fa: "ارسال رایگان", en: "Free shipping" }, total: 0 }],
        couponLines: discount > 0 ? [{ id: id * 1000, code: "WELCOME10", discount }] : [],
        taxLines: [{ id: id * 10000, label: { fa: "مالیات بر ارزش افزوده", en: "VAT" }, rate: 10, total: taxTotal }],
        history: buildOrderHistory(status, placedAt, customer.firstName),
        notes: buildOrderNotes(index, customer.firstName, placedAt),
    };
});

function buildOrderHistory(
    status: OrderStatus,
    placedAt: string,
    actorName: string,
): { id: number; fromStatus: OrderStatus | null; toStatus: OrderStatus; occurredAt: string; changedBy: string; reason: null }[] {
    const entries: {
        id: number;
        fromStatus: OrderStatus | null;
        toStatus: OrderStatus;
        occurredAt: string;
        changedBy: string;
        reason: null;
    }[] = [{ id: 1, fromStatus: null, toStatus: "pending", occurredAt: placedAt, changedBy: actorName, reason: null }];
    if (status !== "pending") {
        const second: OrderStatus = status === "failed" || status === "cancelled" ? status : "processing";
        entries.push({ id: 2, fromStatus: "pending", toStatus: second, occurredAt: placedAt, changedBy: "system", reason: null });
    }
    if (status === "completed") {
        entries.push({
            id: 3,
            fromStatus: "processing",
            toStatus: "completed",
            occurredAt: placedAt,
            changedBy: "admin",
            reason: null,
        });
    }
    return entries;
}

function buildOrderNotes(
    index: number,
    actorName: string,
    placedAt: string,
): { id: number; body: string; visibility: "customer" | "internal"; authorName: string; createdAt: string }[] {
    if (index % 4 !== 0) return [];
    return [
        {
            id: 1,
            body: "لطفاً جعبه‌بندی هدیه انجام شود.",
            visibility: "customer",
            authorName: actorName,
            createdAt: placedAt,
        },
    ];
}

export const refunds: AdminRefund[] = orders
    .filter((order) => order.status === "refunded")
    .map((order, index) => ({
        id: index + 1,
        refundNumber: 9000 + index,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.grandTotal,
        reason: "درخواست مشتری — عدم رضایت از کیفیت بسته‌بندی",
        refundedByName: "مدیر فروش",
        processedAt: order.createdAt,
        gatewayRefundId: `gw_refund_${order.id}`,
    }));

/* -------------------------------------------------------------------------- */
/*  Coupons                                                                   */
/* -------------------------------------------------------------------------- */

export const coupons: AdminCoupon[] = [
    {
        id: 1,
        code: "WELCOME10",
        discountType: "percent",
        amountMinor: null,
        amountPercent: 10,
        description: { fa: "تخفیف خوش‌آمدگویی ۱۰٪", en: "Welcome 10% discount" },
        expiresAt: "2026-12-31T00:00:00Z",
        individualUse: true,
        excludeSaleItems: false,
        minimumAmount: 500_000_0,
        maximumAmount: null,
        usageLimitGlobal: 1000,
        usageLimitPerUser: 1,
        freeShipping: false,
        status: "active",
        usageCount: 124,
    },
    {
        id: 2,
        code: "NOWRUZ",
        discountType: "fixed_cart",
        amountMinor: 500_000_0,
        amountPercent: null,
        description: { fa: "تخفیف نوروزی ثابت", en: "Nowruz fixed-cart discount" },
        expiresAt: "2026-04-15T00:00:00Z",
        individualUse: false,
        excludeSaleItems: true,
        minimumAmount: 1_000_000_0,
        maximumAmount: null,
        usageLimitGlobal: null,
        usageLimitPerUser: 3,
        freeShipping: false,
        status: "disabled",
        usageCount: 412,
    },
    {
        id: 3,
        code: "FREESHIP",
        discountType: "free_shipping",
        amountMinor: null,
        amountPercent: null,
        description: { fa: "ارسال رایگان برای سفارش‌های بالای ۵۰۰ هزار تومان", en: "Free shipping for orders above 500k Toman" },
        expiresAt: null,
        individualUse: false,
        excludeSaleItems: false,
        minimumAmount: 5_000_000_0,
        maximumAmount: null,
        usageLimitGlobal: null,
        usageLimitPerUser: null,
        freeShipping: true,
        status: "active",
        usageCount: 286,
    },
    {
        id: 4,
        code: "VIP25",
        discountType: "percent",
        amountMinor: null,
        amountPercent: 25,
        description: { fa: "تخفیف ویژه مشتریان وفادار", en: "Loyalty 25% off" },
        expiresAt: "2026-08-30T00:00:00Z",
        individualUse: true,
        excludeSaleItems: true,
        minimumAmount: 3_000_000_0,
        maximumAmount: 50_000_000_0,
        usageLimitGlobal: 200,
        usageLimitPerUser: 1,
        freeShipping: false,
        status: "active",
        usageCount: 38,
    },
    {
        id: 5,
        code: "FIRSTBUY",
        discountType: "fixed_product",
        amountMinor: 200_000_0,
        amountPercent: null,
        description: { fa: "اولین خرید مشتریان جدید", en: "First-purchase discount" },
        expiresAt: null,
        individualUse: false,
        excludeSaleItems: false,
        minimumAmount: null,
        maximumAmount: null,
        usageLimitGlobal: null,
        usageLimitPerUser: 1,
        freeShipping: false,
        status: "active",
        usageCount: 92,
    },
];

/* -------------------------------------------------------------------------- */
/*  Tax + shipping + payments                                                 */
/* -------------------------------------------------------------------------- */

export const taxClasses: AdminTaxClass[] = [
    { id: 1, slug: "standard", name: { fa: "استاندارد", en: "Standard" }, rateCount: 1 },
    { id: 2, slug: "reduced-rate", name: { fa: "نرخ کاهش‌یافته", en: "Reduced rate" }, rateCount: 0 },
    { id: 3, slug: "zero-rate", name: { fa: "نرخ صفر", en: "Zero rate" }, rateCount: 0 },
];

export const taxRates: AdminTaxRate[] = [
    {
        id: 1,
        taxClassId: 1,
        country: "IR",
        provinceCode: null,
        cities: null,
        ratePercent: 10,
        label: { fa: "مالیات بر ارزش افزوده", en: "Value-Added Tax" },
        priority: 1,
        compound: false,
        appliesToShipping: true,
    },
];

export const shippingZones: AdminShippingZone[] = [
    { id: 1, name: { fa: "ایران", en: "Iran" }, isFallback: false, countries: ["IR"], methodCount: 3 },
    { id: 2, name: { fa: "سایر کشورها", en: "Rest of World" }, isFallback: true, countries: [], methodCount: 1 },
];

export const shippingMethods: AdminShippingMethod[] = [
    {
        id: 1,
        code: "flat_rate",
        titleDefault: { fa: "نرخ ثابت", en: "Flat rate" },
        descriptionDefault: { fa: "ارسال با هزینه ثابت در هر زون.", en: "Fixed-cost shipping per zone." },
    },
    {
        id: 2,
        code: "free_shipping",
        titleDefault: { fa: "ارسال رایگان", en: "Free shipping" },
        descriptionDefault: { fa: "بدون هزینه ارسال.", en: "Zero cost shipping." },
    },
    {
        id: 3,
        code: "local_pickup",
        titleDefault: { fa: "تحویل حضوری", en: "Local pickup" },
        descriptionDefault: { fa: "مشتری شخصاً سفارش را تحویل می‌گیرد.", en: "Customer picks up in-store." },
    },
    {
        id: 4,
        code: "post_pishtaz",
        titleDefault: { fa: "پست پیشتاز", en: "Post Pishtaz" },
        descriptionDefault: { fa: "ارسال با پست پیشتاز شرکت پست.", en: "Domestic priority post." },
    },
    {
        id: 5,
        code: "post_sefareshi",
        titleDefault: { fa: "پست سفارشی", en: "Post Sefareshi" },
        descriptionDefault: { fa: "ارسال اقتصادی با پست سفارشی.", en: "Standard domestic mail." },
    },
    {
        id: 6,
        code: "tipax",
        titleDefault: { fa: "تیپاکس", en: "Tipax" },
        descriptionDefault: { fa: "ارسال با شرکت تیپاکس.", en: "Tipax courier." },
    },
];

export const shippingZoneMethods: AdminShippingZoneMethod[] = [
    {
        id: 1,
        zoneId: 1,
        methodCode: "post_pishtaz",
        title: { fa: "پست پیشتاز", en: "Post Pishtaz" },
        cost: 500_000,
        enabled: true,
        ordering: 0,
    },
    { id: 2, zoneId: 1, methodCode: "tipax", title: { fa: "تیپاکس", en: "Tipax" }, cost: 800_000, enabled: true, ordering: 1 },
    {
        id: 3,
        zoneId: 1,
        methodCode: "free_shipping",
        title: { fa: "ارسال رایگان (بالای ۵۰۰ هزار تومان)", en: "Free shipping (over 500k Toman)" },
        cost: 0,
        enabled: true,
        ordering: 2,
    },
    {
        id: 4,
        zoneId: 2,
        methodCode: "flat_rate",
        title: { fa: "ارسال بین‌المللی نرخ ثابت", en: "International flat rate" },
        cost: 5_000_000,
        enabled: false,
        ordering: 0,
    },
];

export const paymentGateways: AdminPaymentGateway[] = [
    {
        id: 1,
        code: "zarinpal",
        title: { fa: "زرین‌پال", en: "ZarinPal" },
        description: { fa: "پرداخت آنلاین از طریق درگاه زرین‌پال.", en: "Online payment via ZarinPal." },
        customerInstructions: {
            fa: "پس از کلیک روی ثبت سفارش به درگاه زرین‌پال هدایت می‌شوید.",
            en: "You will be redirected to ZarinPal after placing the order.",
        },
        enabled: true,
        ordering: 0,
        supportsRefunds: true,
        settings: { merchant_id: "00000000-0000-0000-0000-000000000000", sandbox: "true" },
    },
    {
        id: 2,
        code: "idpay",
        title: { fa: "آیدی‌پی", en: "IDPay" },
        description: { fa: "درگاه پرداخت آیدی‌پی.", en: "IDPay gateway." },
        customerInstructions: {
            fa: "پس از ثبت سفارش به آیدی‌پی منتقل می‌شوید.",
            en: "Redirected to IDPay after order submission.",
        },
        enabled: false,
        ordering: 1,
        supportsRefunds: false,
        settings: { api_key: "" },
    },
    {
        id: 3,
        code: "nextpay",
        title: { fa: "نکست‌پی", en: "NextPay" },
        description: { fa: "درگاه نکست‌پی.", en: "NextPay gateway." },
        customerInstructions: {
            fa: "پس از ثبت سفارش به نکست‌پی منتقل می‌شوید.",
            en: "Redirected to NextPay after order submission.",
        },
        enabled: false,
        ordering: 2,
        supportsRefunds: false,
        settings: { api_key: "" },
    },
    {
        id: 4,
        code: "payir",
        title: { fa: "پی.آی‌آر", en: "Pay.ir" },
        description: { fa: "درگاه پرداخت پی.آی‌آر.", en: "Pay.ir gateway." },
        customerInstructions: {
            fa: "پس از ثبت سفارش به پی.آی‌آر منتقل می‌شوید.",
            en: "Redirected to Pay.ir after order submission.",
        },
        enabled: false,
        ordering: 3,
        supportsRefunds: false,
        settings: { api_key: "" },
    },
    {
        id: 5,
        code: "zibal",
        title: { fa: "زیبال", en: "Zibal" },
        description: { fa: "درگاه پرداخت زیبال.", en: "Zibal gateway." },
        customerInstructions: { fa: "پس از ثبت سفارش به زیبال منتقل می‌شوید.", en: "Redirected to Zibal after order submission." },
        enabled: false,
        ordering: 4,
        supportsRefunds: false,
        settings: { merchant: "" },
    },
    {
        id: 6,
        code: "cod",
        title: { fa: "پرداخت در محل", en: "Cash on delivery" },
        description: { fa: "هنگام تحویل سفارش به مأمور ارسال بپردازید.", en: "Pay at the door on delivery." },
        customerInstructions: { fa: "مبلغ سفارش هنگام تحویل دریافت می‌شود.", en: "Payment collected upon delivery." },
        enabled: true,
        ordering: 5,
        supportsRefunds: false,
        settings: {},
    },
    {
        id: 7,
        code: "bank_transfer",
        title: { fa: "کارت‌به‌کارت", en: "Bank transfer" },
        description: { fa: "پرداخت از طریق کارت‌به‌کارت یا واریز به حساب.", en: "Pay by direct bank transfer." },
        customerInstructions: {
            fa: "پس از ثبت سفارش شماره کارت / IBAN به ایمیل ارسال می‌شود.",
            en: "Card / IBAN details emailed after submission.",
        },
        enabled: true,
        ordering: 6,
        supportsRefunds: false,
        settings: { iban: "IR000000000000000000000000" },
    },
];

/* -------------------------------------------------------------------------- */
/*  Settings                                                                  */
/* -------------------------------------------------------------------------- */

export const settingsGroups: AdminSettingsGroup[] = [
    {
        key: "general",
        title: { fa: "تنظیمات کلی", en: "General" },
        subtitle: { fa: "هویت فروشگاه، واحد پول و موقعیت پیش‌فرض.", en: "Store identity, currency, and default location." },
        fields: [
            {
                key: "store_name",
                label: { fa: "نام فروشگاه", en: "Store name" },
                description: { fa: "نام نمایش‌داده‌شده در سراسر سایت.", en: "Displayed throughout the storefront." },
                type: "text",
                value: "Calibra",
            },
            {
                key: "currency_display",
                label: { fa: "واحد نمایش", en: "Display currency" },
                description: { fa: "تومان یا ریال در نمایش قیمت‌ها.", en: "Show prices in Toman or Rial." },
                type: "select",
                value: "IRT",
                options: [
                    { value: "IRT", label: { fa: "تومان", en: "Toman" } },
                    { value: "IRR", label: { fa: "ریال", en: "Rial" } },
                ],
            },
            {
                key: "default_country",
                label: { fa: "کشور پیش‌فرض", en: "Default country" },
                description: { fa: "کشور پیش‌فرض برای آدرس‌های جدید.", en: "Default country for new addresses." },
                type: "select",
                value: "IR",
                options: [
                    { value: "IR", label: { fa: "ایران", en: "Iran" } },
                    { value: "US", label: { fa: "ایالات متحده", en: "United States" } },
                ],
            },
        ],
    },
    {
        key: "products",
        title: { fa: "تنظیمات محصولات", en: "Products" },
        subtitle: { fa: "موجودی، نقد و بررسی و تنظیمات کاتالوگ.", en: "Inventory, reviews, and catalog defaults." },
        fields: [
            {
                key: "manage_stock",
                label: { fa: "مدیریت موجودی فعال", en: "Inventory tracking enabled" },
                description: { fa: "موجودی محصولات به‌صورت سراسری ردیابی شود.", en: "Track stock globally for all products." },
                type: "switch",
                value: true,
            },
            {
                key: "low_stock_threshold",
                label: { fa: "آستانه موجودی کم", en: "Low-stock threshold" },
                description: {
                    fa: "موجودی کمتر از این مقدار، در داشبورد به‌عنوان «موجودی کم» علامت‌گذاری می‌شود.",
                    en: "Below this, items are flagged on the dashboard.",
                },
                type: "number",
                value: 3,
            },
            {
                key: "reviews_enabled",
                label: { fa: "نقد و بررسی فعال", en: "Reviews enabled" },
                description: { fa: "اجازه ارسال نقد و بررسی برای محصولات.", en: "Allow customers to submit reviews." },
                type: "switch",
                value: true,
            },
        ],
    },
    {
        key: "tax",
        title: { fa: "تنظیمات مالیات", en: "Tax" },
        subtitle: { fa: "نحوه محاسبه و نمایش مالیات بر ارزش افزوده.", en: "How VAT is computed and displayed." },
        fields: [
            {
                key: "prices_include_tax",
                label: { fa: "قیمت‌ها شامل مالیات هستند", en: "Prices include tax" },
                description: { fa: "قیمت‌های ثبت‌شده شامل مالیات هستند.", en: "Stored prices already include tax." },
                type: "switch",
                value: true,
            },
            {
                key: "tax_display_shop",
                label: { fa: "نمایش قیمت در فروشگاه", en: "Shop price display" },
                description: {
                    fa: "قیمت‌های صفحه محصول با یا بدون مالیات نمایش داده شوند.",
                    en: "Show shop prices including or excluding tax.",
                },
                type: "select",
                value: "incl",
                options: [
                    { value: "incl", label: { fa: "شامل مالیات", en: "Including tax" } },
                    { value: "excl", label: { fa: "بدون مالیات", en: "Excluding tax" } },
                ],
            },
        ],
    },
    {
        key: "shipping",
        title: { fa: "تنظیمات ارسال", en: "Shipping" },
        subtitle: { fa: "پیش‌فرض‌های زون ارسال و رفتار حساب‌رزرو موجودی.", en: "Zone defaults and stock-reservation behavior." },
        fields: [
            {
                key: "hold_stock_minutes",
                label: { fa: "زمان رزرو موجودی (دقیقه)", en: "Stock reservation (minutes)" },
                description: {
                    fa: "حداکثر زمان نگه‌داری موجودی برای سفارش‌های در انتظار پرداخت.",
                    en: "Maximum hold time for pending-payment orders.",
                },
                type: "number",
                value: 60,
            },
            {
                key: "calculate_per_address",
                label: { fa: "محاسبه بر اساس آدرس مشتری", en: "Calculate per shipping address" },
                description: {
                    fa: "هزینه ارسال بر اساس آدرس واردشده محاسبه می‌شود.",
                    en: "Compute shipping based on the entered destination.",
                },
                type: "switch",
                value: true,
            },
        ],
    },
    {
        key: "account",
        title: { fa: "حساب‌های مشتریان", en: "Customer accounts" },
        subtitle: { fa: "ثبت‌نام و رفتار صفحه حساب کاربری.", en: "Registration and account-area behavior." },
        fields: [
            {
                key: "allow_registration",
                label: { fa: "اجازه ثبت‌نام مشتری", en: "Allow customer registration" },
                description: { fa: "اجازه ایجاد حساب جدید در فروشگاه.", en: "Allow new customers to create accounts." },
                type: "switch",
                value: true,
            },
            {
                key: "verify_email",
                label: { fa: "تایید ایمیل اجباری", en: "Require email verification" },
                description: { fa: "ارسال لینک تایید پس از ثبت‌نام.", en: "Email a verification link after registration." },
                type: "switch",
                value: false,
            },
        ],
    },
    {
        key: "email",
        title: { fa: "تنظیمات ایمیل", en: "Email" },
        subtitle: { fa: "فرستنده پیش‌فرض و فعال‌سازی قالب‌ها.", en: "Default sender and template toggles." },
        fields: [
            {
                key: "sender_name",
                label: { fa: "نام فرستنده", en: "Sender name" },
                description: { fa: "نامی که در ایمیل‌های مشتری نمایش داده می‌شود.", en: "Name shown in customer-facing emails." },
                type: "text",
                value: "Calibra Store",
            },
            {
                key: "sender_address",
                label: { fa: "آدرس فرستنده", en: "Sender address" },
                description: {
                    fa: "آدرس از ایمیلی که برای ارسال استفاده می‌شود.",
                    en: "Address used as the from-header on outbound mail.",
                },
                type: "text",
                value: "no-reply@calibra.example",
            },
            {
                key: "order_completed_email",
                label: { fa: "ایمیل تکمیل سفارش", en: "Order-completed email" },
                description: {
                    fa: "ارسال ایمیل به مشتری در زمان تکمیل سفارش.",
                    en: "Email the customer when an order completes.",
                },
                type: "switch",
                value: true,
            },
        ],
    },
    {
        key: "advanced",
        title: { fa: "تنظیمات پیشرفته", en: "Advanced" },
        subtitle: { fa: "گزینه‌های توسعه‌دهنده و کلیدهای API.", en: "Developer options and API keys." },
        fields: [
            {
                key: "debug_mode",
                label: { fa: "حالت اشکال‌زدایی", en: "Debug mode" },
                description: { fa: "نمایش جزئیات بیشتر در پاسخ‌های خطای API.", en: "Show extra detail in API error responses." },
                type: "switch",
                value: false,
            },
            {
                key: "api_base_url",
                label: { fa: "آدرس پایه API", en: "API base URL" },
                description: {
                    fa: "این آدرس را فقط در محیط‌های توسعه تغییر دهید.",
                    en: "Change only in development environments.",
                },
                type: "text",
                value: "https://api.calibra.example",
            },
        ],
    },
];

/* -------------------------------------------------------------------------- */
/*  Dashboard + reports                                                       */
/* -------------------------------------------------------------------------- */

function buildSalesSeries(days: number, base: number): { date: string; revenue: number; orders: number; refunded: number }[] {
    const out: { date: string; revenue: number; orders: number; refunded: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(Date.UTC(2026, 4, 18 - i));
        const wave = Math.sin((i / days) * Math.PI * 2) * 0.45 + 1;
        const noise = ((i * 31) % 19) / 50;
        const revenue = Math.round((base + base * (wave + noise)) * 10);
        out.push({
            date: date.toISOString().slice(0, 10),
            revenue,
            orders: Math.max(2, Math.round(8 + wave * 8 + ((i * 5) % 7))),
            refunded: i % 7 === 0 ? Math.round(revenue * 0.08) : 0,
        });
    }
    return out;
}

export const dashboard = {
    ordersToday: 42,
    ordersDeltaPercent: 12.4,
    revenueToday: 2_840_000_0,
    revenueDeltaPercent: 8.1,
    activeProducts: products.filter((p) => p.status === "publish").length,
    activeProductsDeltaPercent: -2.3,
    pendingFulfilments: orders.filter((o) => o.status === "processing").length,
    newCustomersToday: 6,
    salesSeries: buildSalesSeries(14, 1_800_000).map(({ date, revenue, orders }) => ({ date, revenue, orders })),
    ordersByStatus: (
        Object.entries(
            orders.reduce<Record<string, number>>((acc, order) => {
                acc[order.status] = (acc[order.status] ?? 0) + 1;
                return acc;
            }, {}),
        ) as [OrderStatus, number][]
    ).map(([status, count]) => ({ status, count })),
    topProducts: products.slice(0, 6).map((p, index) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        revenue: (p.salePrice ?? p.regularPrice) * (12 - index),
        units: 12 - index,
    })),
    recentOrders: orders.slice(0, 5),
};

export const salesReport = {
    totalRevenue: 145_280_000_0,
    netRevenue: 132_640_000_0,
    refundedAmount: 12_640_000_0,
    averageOrderValue: 4_280_000_0,
    orderCount: 318,
    series: buildSalesSeries(30, 1_400_000),
};

export const topSellersReport = {
    range: { startDate: "2026-04-18", endDate: "2026-05-18" },
    rows: products
        .slice(0, 10)
        .map((p, index) => ({
            productId: p.id,
            name: p.name,
            sku: p.sku,
            units: 84 - index * 6,
            revenue: (p.salePrice ?? p.regularPrice) * (84 - index * 6),
        }))
        .sort((a, b) => b.revenue - a.revenue),
};
