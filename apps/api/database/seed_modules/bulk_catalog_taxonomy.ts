/**
 * Digikala-style hierarchical catalog taxonomy seeded by {@link BulkDatasetSeeder}. The structure
 * mirrors a real Iranian e-commerce taxonomy — 8 top-level departments, 2–5 mid-level sections per
 * department, 1–4 leaf categories under each section. Every leaf carries a {@link LeafProductSpec}
 * with realistic name patterns, brand affinity, and price ranges so generated products read like
 * real catalog rows ("گوشی هوشمند Samsung Galaxy A52") rather than lorem-ipsum.
 *
 * Slugs are namespaced with `bk-` so the bulk seeder's tree is trivially distinguishable from the
 * 8 flat demo categories shipped by `0002_catalog_demo_seeder` — both can coexist.
 */
export interface CategoryNode {
    fa: string;
    en: string;
    slugBase: string;
    children?: CategoryNode[];
    /** Product templates for leaf-only nodes. Branch nodes have no products of their own. */
    products?: LeafProductSpec;
}

export interface LeafProductSpec {
    /** Persian name pattern using `{brand}` / `{model}` placeholders. */
    namePatternFa: string;
    /** English name pattern using `{brand}` / `{model}` placeholders. */
    namePatternEn: string;
    /** Min price in Rial minor units. */
    priceMin: number;
    /** Max price in Rial minor units. */
    priceMax: number;
    /** Brand pool. Picked randomly per product. */
    brands: string[];
    /** Model name suffixes. Picked randomly per product. */
    models: string[];
    /** Persian short-description templates. Picked randomly per product. */
    blurbs: string[];
}

export const BULK_CATEGORY_TREE: CategoryNode[] = [
    {
        fa: "دیجیتال",
        en: "Digital",
        slugBase: "bk-digital",
        children: [
            {
                fa: "موبایل",
                en: "Mobile",
                slugBase: "bk-mobile",
                children: [
                    {
                        fa: "گوشی هوشمند",
                        en: "Smartphones",
                        slugBase: "bk-smartphones",
                        products: {
                            namePatternFa: "گوشی هوشمند {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Smartphone",
                            priceMin: 5_000_000,
                            priceMax: 80_000_000,
                            brands: ["Samsung", "Apple", "Xiaomi", "Huawei", "Honor", "OPPO", "Realme", "Nokia"],
                            models: [
                                "Galaxy A52",
                                "Galaxy S23",
                                "iPhone 14",
                                "Redmi Note 12",
                                "Mi 11",
                                "Nova 9",
                                "Magic 5",
                                "Reno 8",
                            ],
                            blurbs: [
                                "گوشی هوشمند با دوربین ۴۸ مگاپیکسلی و باتری بزرگ.",
                                "صفحه نمایش AMOLED شش‌اینچی و حافظه ۱۲۸ گیگابایت.",
                                "پشتیبانی از شبکه ۵G و شارژ سریع.",
                            ],
                        },
                    },
                    {
                        fa: "تبلت",
                        en: "Tablets",
                        slugBase: "bk-tablets",
                        products: {
                            namePatternFa: "تبلت {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Tablet",
                            priceMin: 8_000_000,
                            priceMax: 50_000_000,
                            brands: ["Samsung", "Apple", "Huawei", "Lenovo", "Xiaomi"],
                            models: ["Galaxy Tab A8", "iPad Air", "MatePad 11", "Tab P11", "Pad 5"],
                            blurbs: ["تبلت ۱۰ اینچی با حافظه ۶۴ گیگابایت.", "ایده‌آل برای مطالعه و کار."],
                        },
                    },
                    {
                        fa: "قاب گوشی",
                        en: "Phone Cases",
                        slugBase: "bk-phone-cases",
                        products: {
                            namePatternFa: "قاب گوشی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Phone Case",
                            priceMin: 200_000,
                            priceMax: 2_500_000,
                            brands: ["Spigen", "OtterBox", "UAG", "Nillkin", "Baseus"],
                            models: ["Tough Armor", "Symmetry", "Plasma", "Frosted Shield", "Crystal Clear"],
                            blurbs: ["قاب محافظ ضد ضربه و ضد خش.", "طراحی شیک و سبک."],
                        },
                    },
                    {
                        fa: "شارژر و کابل",
                        en: "Chargers & Cables",
                        slugBase: "bk-chargers",
                        products: {
                            namePatternFa: "شارژر {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Charger",
                            priceMin: 300_000,
                            priceMax: 4_500_000,
                            brands: ["Anker", "Baseus", "UGREEN", "Belkin", "Samsung"],
                            models: ["PowerPort III", "GaN 65W", "Nexode", "BoostUp", "EP-T2510"],
                            blurbs: ["شارژر فست‌چارج با کابل تایپ-سی.", "خروجی ۶۵ وات با ایمنی بالا."],
                        },
                    },
                    {
                        fa: "پاوربانک",
                        en: "Power Banks",
                        slugBase: "bk-power-banks",
                        products: {
                            namePatternFa: "پاوربانک {brand} ظرفیت {model}",
                            namePatternEn: "{brand} {model} Power Bank",
                            priceMin: 800_000,
                            priceMax: 6_500_000,
                            brands: ["Anker", "Xiaomi", "Romoss", "Baseus", "Mophie"],
                            models: ["10000mAh", "20000mAh", "30000mAh", "PD 25W", "QC 18W"],
                            blurbs: ["پاوربانک با خروجی فست‌چارج.", "ظرفیت بالا و سبک."],
                        },
                    },
                ],
            },
            {
                fa: "لپ‌تاپ و کامپیوتر",
                en: "Laptop & Computer",
                slugBase: "bk-laptop-computer",
                children: [
                    {
                        fa: "لپ‌تاپ",
                        en: "Laptops",
                        slugBase: "bk-laptops",
                        products: {
                            namePatternFa: "لپ‌تاپ {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Laptop",
                            priceMin: 30_000_000,
                            priceMax: 150_000_000,
                            brands: ["ASUS", "Lenovo", "HP", "Dell", "Acer", "Apple", "MSI"],
                            models: [
                                "VivoBook 15",
                                "IdeaPad 3",
                                "Pavilion 14",
                                "Inspiron 15",
                                "Aspire 5",
                                "MacBook Air M2",
                                "Modern 14",
                            ],
                            blurbs: ["لپ‌تاپ ۱۵ اینچی با پردازنده Core i5.", "۸ گیگابایت رم و ۵۱۲ گیگابایت SSD."],
                        },
                    },
                    {
                        fa: "مانیتور",
                        en: "Monitors",
                        slugBase: "bk-monitors",
                        products: {
                            namePatternFa: "مانیتور {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Monitor",
                            priceMin: 10_000_000,
                            priceMax: 60_000_000,
                            brands: ["Samsung", "LG", "Dell", "ASUS", "Acer", "BenQ"],
                            models: ["Curved 27", "UltraGear 32", "S2421HN", "ProArt 24", "Nitro 27", "EW2780"],
                            blurbs: ["مانیتور ۲۷ اینچی با فرکانس ۱۴۴ هرتز.", "وضوح Full HD و IPS."],
                        },
                    },
                    {
                        fa: "کیبورد",
                        en: "Keyboards",
                        slugBase: "bk-keyboards",
                        products: {
                            namePatternFa: "کیبورد {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Keyboard",
                            priceMin: 1_500_000,
                            priceMax: 12_000_000,
                            brands: ["Logitech", "Razer", "Corsair", "HyperX", "SteelSeries"],
                            models: ["MX Keys", "Huntsman Mini", "K70", "Alloy Origins", "Apex 7"],
                            blurbs: ["کیبورد مکانیکی با سوییچ‌های آبی.", "بک‌لایت RGB و مقاوم."],
                        },
                    },
                    {
                        fa: "ماوس",
                        en: "Mice",
                        slugBase: "bk-mice",
                        products: {
                            namePatternFa: "ماوس {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Mouse",
                            priceMin: 500_000,
                            priceMax: 8_000_000,
                            brands: ["Logitech", "Razer", "Microsoft", "SteelSeries", "Glorious"],
                            models: ["MX Master 3", "DeathAdder V2", "Surface Mouse", "Aerox 3", "Model O"],
                            blurbs: ["ماوس بی‌سیم با باتری قابل شارژ.", "حساسیت ۱۶۰۰۰ DPI."],
                        },
                    },
                ],
            },
            {
                fa: "صوتی و تصویری",
                en: "Audio & Video",
                slugBase: "bk-audio-video",
                children: [
                    {
                        fa: "تلویزیون",
                        en: "Televisions",
                        slugBase: "bk-tvs",
                        products: {
                            namePatternFa: "تلویزیون {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Television",
                            priceMin: 30_000_000,
                            priceMax: 200_000_000,
                            brands: ["Samsung", "LG", "Sony", "TCL", "Hisense"],
                            models: ["QLED 55", "OLED 55", "Bravia 65", "C835 65", "U7H 50"],
                            blurbs: ["تلویزیون ۵۵ اینچی هوشمند ۴K.", "پشتیبانی از HDR و Dolby Atmos."],
                        },
                    },
                    {
                        fa: "هدفون",
                        en: "Headphones",
                        slugBase: "bk-headphones",
                        products: {
                            namePatternFa: "هدفون {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Headphones",
                            priceMin: 1_500_000,
                            priceMax: 30_000_000,
                            brands: ["Sony", "Bose", "Sennheiser", "Apple", "JBL"],
                            models: ["WH-1000XM5", "QuietComfort 45", "Momentum 4", "AirPods Max", "Tune 760NC"],
                            blurbs: ["هدفون بی‌سیم با حذف نویز فعال.", "عمر باتری ۳۰ ساعت."],
                        },
                    },
                    {
                        fa: "اسپیکر بلوتوثی",
                        en: "Bluetooth Speakers",
                        slugBase: "bk-bluetooth-speakers",
                        products: {
                            namePatternFa: "اسپیکر بلوتوثی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Bluetooth Speaker",
                            priceMin: 1_200_000,
                            priceMax: 18_000_000,
                            brands: ["JBL", "Sony", "Bose", "Anker", "Marshall"],
                            models: ["Charge 5", "SRS-XB23", "SoundLink Flex", "Soundcore Boom", "Emberton"],
                            blurbs: ["اسپیکر قابل حمل ضد آب IPX7.", "صدای استریو با باتری ۱۲ ساعته."],
                        },
                    },
                ],
            },
            {
                fa: "دوربین و فیلمبرداری",
                en: "Camera & Photography",
                slugBase: "bk-camera",
                children: [
                    {
                        fa: "دوربین دیجیتال",
                        en: "Digital Cameras",
                        slugBase: "bk-digital-cameras",
                        products: {
                            namePatternFa: "دوربین دیجیتال {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Digital Camera",
                            priceMin: 25_000_000,
                            priceMax: 250_000_000,
                            brands: ["Canon", "Nikon", "Sony", "Fujifilm", "Panasonic"],
                            models: ["EOS R6", "Z6 II", "Alpha 7 IV", "X-T5", "Lumix S5"],
                            blurbs: ["دوربین بدون آینه فول‌فریم.", "وضوح ۲۴ مگاپیکسلی و فیلم ۴K."],
                        },
                    },
                    {
                        fa: "دوربین ورزشی",
                        en: "Action Cameras",
                        slugBase: "bk-action-cameras",
                        products: {
                            namePatternFa: "دوربین ورزشی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Action Camera",
                            priceMin: 8_000_000,
                            priceMax: 35_000_000,
                            brands: ["GoPro", "Insta360", "DJI"],
                            models: ["HERO 11 Black", "ONE RS", "Action 3"],
                            blurbs: ["دوربین ورزشی ضد آب با وضوح ۴K.", "تثبیت تصویر پیشرفته."],
                        },
                    },
                ],
            },
            {
                fa: "گیمینگ",
                en: "Gaming",
                slugBase: "bk-gaming",
                children: [
                    {
                        fa: "کنسول بازی",
                        en: "Game Consoles",
                        slugBase: "bk-consoles",
                        products: {
                            namePatternFa: "کنسول بازی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Game Console",
                            priceMin: 28_000_000,
                            priceMax: 90_000_000,
                            brands: ["Sony", "Microsoft", "Nintendo"],
                            models: ["PlayStation 5", "Xbox Series X", "Switch OLED", "PlayStation 4 Pro", "Xbox Series S"],
                            blurbs: ["کنسول بازی نسل جدید با گرافیک ۴K.", "هارد SSD داخلی ۸۲۵ گیگابایت."],
                        },
                    },
                    {
                        fa: "دسته بازی",
                        en: "Controllers",
                        slugBase: "bk-controllers",
                        products: {
                            namePatternFa: "دسته بازی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Controller",
                            priceMin: 2_000_000,
                            priceMax: 15_000_000,
                            brands: ["Sony", "Microsoft", "8BitDo", "Razer"],
                            models: ["DualSense", "Xbox Wireless", "Pro 2", "Wolverine V2"],
                            blurbs: ["دسته بازی بی‌سیم با بازخورد لمسی.", "سازگار با PC و کنسول."],
                        },
                    },
                ],
            },
        ],
    },
    {
        fa: "مد و پوشاک",
        en: "Fashion & Apparel",
        slugBase: "bk-fashion",
        children: [
            {
                fa: "مردانه",
                en: "Men",
                slugBase: "bk-mens",
                children: [
                    {
                        fa: "تی‌شرت مردانه",
                        en: "Men's T-Shirts",
                        slugBase: "bk-mens-tshirts",
                        products: {
                            namePatternFa: "تی‌شرت مردانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Men's T-Shirt",
                            priceMin: 600_000,
                            priceMax: 4_500_000,
                            brands: ["Calibra", "Adidas", "Nike", "Puma", "Mango"],
                            models: ["Classic", "Slim Fit", "Crew Neck", "V-Neck", "Polo"],
                            blurbs: ["تی‌شرت پنبه‌ای با چاپ روی سینه.", "مناسب استفاده روزمره."],
                        },
                    },
                    {
                        fa: "شلوار جین مردانه",
                        en: "Men's Jeans",
                        slugBase: "bk-mens-jeans",
                        products: {
                            namePatternFa: "شلوار جین مردانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Men's Jeans",
                            priceMin: 1_500_000,
                            priceMax: 6_500_000,
                            brands: ["Levis", "Diesel", "Lee", "Pull&Bear", "Mango"],
                            models: ["501 Original", "Slim 510", "Regular Fit", "Skinny Fit", "Bootcut"],
                            blurbs: ["شلوار جین مردانه با برش راحت.", "پارچه دنیم با کشسانی متوسط."],
                        },
                    },
                    {
                        fa: "کفش رسمی مردانه",
                        en: "Men's Dress Shoes",
                        slugBase: "bk-mens-dress-shoes",
                        products: {
                            namePatternFa: "کفش رسمی مردانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Men's Dress Shoes",
                            priceMin: 3_000_000,
                            priceMax: 18_000_000,
                            brands: ["Clarks", "Bata", "Ecco", "Geox", "Pier Roma"],
                            models: ["Oxford", "Brogue", "Loafer", "Derby", "Monk Strap"],
                            blurbs: ["کفش چرمی دست‌دوز.", "مناسب مجالس رسمی."],
                        },
                    },
                    {
                        fa: "کاپشن مردانه",
                        en: "Men's Coats",
                        slugBase: "bk-mens-coats",
                        products: {
                            namePatternFa: "کاپشن مردانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Men's Coat",
                            priceMin: 4_000_000,
                            priceMax: 25_000_000,
                            brands: ["The North Face", "Columbia", "Adidas", "Puma", "Calibra"],
                            models: ["Down Jacket", "Parka", "Bomber", "Trench", "Puffer"],
                            blurbs: ["کاپشن گرم زمستانی با لایه پر.", "ضد آب و باد."],
                        },
                    },
                ],
            },
            {
                fa: "زنانه",
                en: "Women",
                slugBase: "bk-womens",
                children: [
                    {
                        fa: "مانتو",
                        en: "Manteau",
                        slugBase: "bk-manteau",
                        products: {
                            namePatternFa: "مانتو زنانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Women's Manteau",
                            priceMin: 2_500_000,
                            priceMax: 12_000_000,
                            brands: ["Sahel", "Pante", "Calibra", "Saten", "Negar"],
                            models: ["کوتاه", "بلند", "کلاسیک", "اسپرت", "مجلسی"],
                            blurbs: ["مانتو زنانه با پارچه مناسب چهار فصل.", "طراحی شیک و راحت."],
                        },
                    },
                    {
                        fa: "کیف زنانه",
                        en: "Women's Bags",
                        slugBase: "bk-womens-bags",
                        products: {
                            namePatternFa: "کیف زنانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Women's Bag",
                            priceMin: 1_800_000,
                            priceMax: 25_000_000,
                            brands: ["Mango", "Bershka", "Charles Keith", "Aldo", "Parfois"],
                            models: ["Tote", "Crossbody", "Hobo", "Shoulder", "Clutch"],
                            blurbs: ["کیف زنانه چرم مصنوعی.", "طراحی شیک و ظرفیت مناسب."],
                        },
                    },
                    {
                        fa: "کفش زنانه",
                        en: "Women's Shoes",
                        slugBase: "bk-womens-shoes",
                        products: {
                            namePatternFa: "کفش زنانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Women's Shoes",
                            priceMin: 1_500_000,
                            priceMax: 18_000_000,
                            brands: ["Aldo", "Charles Keith", "Bata", "Ecco", "Mango"],
                            models: ["Heels", "Flats", "Sneakers", "Boots", "Sandals"],
                            blurbs: ["کفش زنانه راحت و شیک.", "مناسب استفاده روزمره."],
                        },
                    },
                    {
                        fa: "روسری",
                        en: "Scarves",
                        slugBase: "bk-scarves",
                        products: {
                            namePatternFa: "روسری {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Scarf",
                            priceMin: 800_000,
                            priceMax: 6_500_000,
                            brands: ["Azarnoosh", "Sahel", "Calibra", "Iranian Silk"],
                            models: ["ابریشم", "نخی", "ساتن", "ترمه", "طرح سنتی"],
                            blurbs: ["روسری ابریشمی با چاپ ایرانی.", "مناسب جشن‌ها و مهمانی‌ها."],
                        },
                    },
                ],
            },
            {
                fa: "بچگانه",
                en: "Kids",
                slugBase: "bk-kids-apparel",
                children: [
                    {
                        fa: "لباس پسرانه",
                        en: "Boys' Clothing",
                        slugBase: "bk-boys-clothing",
                        products: {
                            namePatternFa: "لباس پسرانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Boys' Outfit",
                            priceMin: 800_000,
                            priceMax: 4_500_000,
                            brands: ["Calibra Kids", "H&M Kids", "Mothercare", "LC Waikiki"],
                            models: ["ست تابستانی", "ست زمستانی", "تی‌شرت", "شلوار", "کاپشن"],
                            blurbs: ["لباس بچگانه پنبه‌ای.", "طراحی راحت و رنگارنگ."],
                        },
                    },
                    {
                        fa: "لباس دخترانه",
                        en: "Girls' Clothing",
                        slugBase: "bk-girls-clothing",
                        products: {
                            namePatternFa: "لباس دخترانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Girls' Outfit",
                            priceMin: 800_000,
                            priceMax: 5_500_000,
                            brands: ["Calibra Kids", "H&M Kids", "Mothercare", "Zara Kids"],
                            models: ["پیراهن", "ست تابستانی", "ست زمستانی", "تاپ", "شلوار"],
                            blurbs: ["لباس دخترانه با پارچه نرم.", "طرح زیبا و رنگ‌های شاد."],
                        },
                    },
                ],
            },
        ],
    },
    {
        fa: "خانه و آشپزخانه",
        en: "Home & Kitchen",
        slugBase: "bk-home",
        children: [
            {
                fa: "لوازم خانگی برقی",
                en: "Home Appliances",
                slugBase: "bk-appliances",
                children: [
                    {
                        fa: "یخچال",
                        en: "Refrigerators",
                        slugBase: "bk-refrigerators",
                        products: {
                            namePatternFa: "یخچال {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Refrigerator",
                            priceMin: 50_000_000,
                            priceMax: 250_000_000,
                            brands: ["Snowa", "Emersun", "Samsung", "LG", "Electrosteel"],
                            models: ["TF 2-180", "BFN-23D", "RT38K5530", "GN-X4", "Side by Side"],
                            blurbs: ["یخچال فریزر کمبی با حجم ۵۰۰ لیتر.", "بدون برفک و کم‌مصرف."],
                        },
                    },
                    {
                        fa: "ماشین لباسشویی",
                        en: "Washing Machines",
                        slugBase: "bk-washing-machines",
                        products: {
                            namePatternFa: "ماشین لباسشویی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Washing Machine",
                            priceMin: 35_000_000,
                            priceMax: 150_000_000,
                            brands: ["Pakshoma", "Snowa", "Samsung", "LG", "Bosch"],
                            models: ["TLF-6711", "SWM-72", "WW80T", "FH4G6", "WAJ24"],
                            blurbs: ["ماشین لباسشویی ۸ کیلویی.", "موتور اینورتر و ۱۴ برنامه شست‌و‌شو."],
                        },
                    },
                    {
                        fa: "جاروبرقی",
                        en: "Vacuum Cleaners",
                        slugBase: "bk-vacuums",
                        products: {
                            namePatternFa: "جاروبرقی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Vacuum Cleaner",
                            priceMin: 6_000_000,
                            priceMax: 45_000_000,
                            brands: ["Samsung", "Bosch", "Philips", "Pars Khazar", "Dyson"],
                            models: ["Power 2200", "Series 4", "FC8294", "VC-2200", "V11"],
                            blurbs: ["جاروبرقی ۲۲۰۰ وات با فیلتر HEPA.", "مخزن بزرگ و کنترل قدرت."],
                        },
                    },
                ],
            },
            {
                fa: "لوازم آشپزخانه",
                en: "Kitchenware",
                slugBase: "bk-kitchenware",
                children: [
                    {
                        fa: "مخلوط‌کن",
                        en: "Blenders",
                        slugBase: "bk-blenders",
                        products: {
                            namePatternFa: "مخلوط‌کن {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Blender",
                            priceMin: 2_500_000,
                            priceMax: 12_000_000,
                            brands: ["Pars Khazar", "Bosch", "Philips", "Moulinex", "Tefal"],
                            models: ["BL-1500", "MMB42G0B", "HR2160", "LM2421", "BL142A"],
                            blurbs: ["مخلوط‌کن ۱۰۰۰ وات با کاسه شیشه‌ای.", "سه سرعت با حالت پالس."],
                        },
                    },
                    {
                        fa: "قهوه‌ساز",
                        en: "Coffee Makers",
                        slugBase: "bk-coffee-makers",
                        products: {
                            namePatternFa: "قهوه‌ساز {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Coffee Maker",
                            priceMin: 4_000_000,
                            priceMax: 30_000_000,
                            brands: ["DeLonghi", "Philips", "Bosch", "Saeco", "Krups"],
                            models: ["EC685", "EP3243", "TIS30521RW", "Xelsis", "Essenza"],
                            blurbs: ["قهوه‌ساز اسپرسو نیمه‌اتوماتیک.", "فشار پمپ ۱۵ بار."],
                        },
                    },
                    {
                        fa: "ست قابلمه",
                        en: "Pots & Pans Sets",
                        slugBase: "bk-pots-pans",
                        products: {
                            namePatternFa: "ست قابلمه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Pots & Pans Set",
                            priceMin: 2_000_000,
                            priceMax: 15_000_000,
                            brands: ["Tefal", "Sun House", "Korkmaz", "Azarnoosh", "BergHOFF"],
                            models: ["گرانیتی", "نچسب", "استیل ۸ تکه", "آلومینیوم", "تفلون"],
                            blurbs: ["ست شش پارچه قابلمه نچسب.", "مناسب همه نوع اجاق."],
                        },
                    },
                ],
            },
            {
                fa: "مبلمان",
                en: "Furniture",
                slugBase: "bk-furniture",
                children: [
                    {
                        fa: "مبل راحتی",
                        en: "Sofas",
                        slugBase: "bk-sofas",
                        products: {
                            namePatternFa: "مبل راحتی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Sofa",
                            priceMin: 20_000_000,
                            priceMax: 150_000_000,
                            brands: ["Tehran Mubl", "Khorshid", "Modus", "Calibra Home"],
                            models: ["L شکل", "سه‌نفره", "کلاسیک", "مدرن", "تخت‌خواب‌شو"],
                            blurbs: ["مبل راحتی ۳ نفره با پارچه مخمل.", "اسکلت چوبی و فوم با دانسیته بالا."],
                        },
                    },
                    {
                        fa: "میز ناهارخوری",
                        en: "Dining Tables",
                        slugBase: "bk-dining-tables",
                        products: {
                            namePatternFa: "میز ناهارخوری {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Dining Table",
                            priceMin: 8_000_000,
                            priceMax: 80_000_000,
                            brands: ["Tehran Mubl", "IKEA", "Khorshid", "Calibra Home"],
                            models: ["۴ نفره", "۶ نفره", "۸ نفره", "گرد", "مستطیل"],
                            blurbs: ["میز ناهارخوری چوبی با صفحه MDF.", "طراحی کلاسیک."],
                        },
                    },
                ],
            },
        ],
    },
    {
        fa: "زیبایی و سلامت",
        en: "Beauty & Health",
        slugBase: "bk-beauty",
        children: [
            {
                fa: "مراقبت پوست",
                en: "Skincare",
                slugBase: "bk-skincare",
                children: [
                    {
                        fa: "کرم مرطوب‌کننده",
                        en: "Moisturizers",
                        slugBase: "bk-moisturizers",
                        products: {
                            namePatternFa: "کرم مرطوب‌کننده {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Moisturizer",
                            priceMin: 600_000,
                            priceMax: 5_500_000,
                            brands: ["Nivea", "Olay", "Cerave", "La Roche-Posay", "Eucerin"],
                            models: ["Soft", "Regenerist", "Hydrating", "Toleriane", "AtoControl"],
                            blurbs: ["کرم مرطوب‌کننده با گلیسیرین.", "مناسب پوست خشک و حساس."],
                        },
                    },
                    {
                        fa: "ضد آفتاب",
                        en: "Sunscreen",
                        slugBase: "bk-sunscreen",
                        products: {
                            namePatternFa: "ضد آفتاب {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Sunscreen",
                            priceMin: 800_000,
                            priceMax: 4_500_000,
                            brands: ["La Roche-Posay", "Bioderma", "Nivea", "Eucerin"],
                            models: ["Anthelios SPF50", "Photoderm SPF50", "Sun Protect", "Sun Gel"],
                            blurbs: ["ضد آفتاب با SPF 50 برای پوست حساس.", "ضد آب با بافت سبک."],
                        },
                    },
                ],
            },
            {
                fa: "آرایش",
                en: "Makeup",
                slugBase: "bk-makeup",
                children: [
                    {
                        fa: "رژ لب",
                        en: "Lipstick",
                        slugBase: "bk-lipstick",
                        products: {
                            namePatternFa: "رژ لب {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Lipstick",
                            priceMin: 500_000,
                            priceMax: 4_500_000,
                            brands: ["MAC", "Maybelline", "L'Oreal", "Rimmel", "NYX"],
                            models: ["Matte", "Glossy", "Liquid", "Stick", "Velvet"],
                            blurbs: ["رژ لب با ماندگاری بالا.", "بافت نرم و رنگ پرپوشش."],
                        },
                    },
                    {
                        fa: "ریمل",
                        en: "Mascara",
                        slugBase: "bk-mascara",
                        products: {
                            namePatternFa: "ریمل {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Mascara",
                            priceMin: 600_000,
                            priceMax: 3_500_000,
                            brands: ["Maybelline", "L'Oreal", "Essence", "Catrice", "Rimmel"],
                            models: ["Lash Sensational", "Volumizing", "Lengthening", "Waterproof", "Curl"],
                            blurbs: ["ریمل حجم‌دهنده با براش ابریشمی.", "ضد آب و ماندگار."],
                        },
                    },
                ],
            },
            {
                fa: "مراقبت مو",
                en: "Hair Care",
                slugBase: "bk-haircare",
                children: [
                    {
                        fa: "شامپو",
                        en: "Shampoo",
                        slugBase: "bk-shampoo",
                        products: {
                            namePatternFa: "شامپو {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Shampoo",
                            priceMin: 400_000,
                            priceMax: 2_500_000,
                            brands: ["Head & Shoulders", "Pantene", "L'Oreal", "Schwarzkopf", "Dove"],
                            models: ["Anti-Dandruff", "Volume", "Repair", "Color Care", "Smooth"],
                            blurbs: ["شامپو با فرمول ضد شوره.", "مناسب موهای خشک و آسیب‌دیده."],
                        },
                    },
                ],
            },
            {
                fa: "عطر و ادکلن",
                en: "Fragrance",
                slugBase: "bk-fragrance",
                children: [
                    {
                        fa: "عطر مردانه",
                        en: "Men's Fragrance",
                        slugBase: "bk-mens-fragrance",
                        products: {
                            namePatternFa: "عطر مردانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Men's Fragrance",
                            priceMin: 3_000_000,
                            priceMax: 35_000_000,
                            brands: ["Bleu de Chanel", "Dior", "Armani", "Versace", "Calvin Klein"],
                            models: ["EDP 100ml", "EDT 100ml", "Pour Homme", "Code", "Eros"],
                            blurbs: ["عطر مردانه با رایحه گرم و چوبی.", "ماندگاری ۱۲ ساعت."],
                        },
                    },
                    {
                        fa: "عطر زنانه",
                        en: "Women's Fragrance",
                        slugBase: "bk-womens-fragrance",
                        products: {
                            namePatternFa: "عطر زنانه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Women's Fragrance",
                            priceMin: 3_000_000,
                            priceMax: 35_000_000,
                            brands: ["Chanel No 5", "Dior", "YSL", "Lancome", "Givenchy"],
                            models: ["EDP 100ml", "Mademoiselle", "Black Opium", "La Vie est Belle", "Irresistible"],
                            blurbs: ["عطر زنانه با رایحه گل‌های شرقی.", "بطری شیک و کلاسیک."],
                        },
                    },
                ],
            },
        ],
    },
    {
        fa: "کتاب و لوازم تحریر",
        en: "Books & Stationery",
        slugBase: "bk-books-stationery",
        children: [
            {
                fa: "رمان و داستان",
                en: "Novels & Fiction",
                slugBase: "bk-novels",
                products: {
                    namePatternFa: "رمان {model} اثر {brand}",
                    namePatternEn: "{model} by {brand}",
                    priceMin: 200_000,
                    priceMax: 2_500_000,
                    brands: ["صادق هدایت", "هوشنگ مرادی کرمانی", "غلامحسین ساعدی", "محمود دولت‌آبادی", "زویا پیرزاد"],
                    models: ["بوف کور", "قصه‌های مجید", "آنک آن یتیم نظر کرده", "کلیدر", "چراغ‌ها را من خاموش می‌کنم"],
                    blurbs: ["جلد شومیز با چاپ باکیفیت.", "نشر ققنوس - چاپ هفتم."],
                },
            },
            {
                fa: "کتاب کودک",
                en: "Children's Books",
                slugBase: "bk-childrens-books",
                products: {
                    namePatternFa: "کتاب کودک {model}",
                    namePatternEn: "{model} - Children's Book",
                    priceMin: 150_000,
                    priceMax: 1_500_000,
                    brands: ["نشر هوپا", "نشر چشمه", "نشر افق", "کتاب نیستان"],
                    models: ["مجموعه شعر کودک", "داستان‌های قبل از خواب", "علم برای کودکان", "حیوانات جنگل"],
                    blurbs: ["کتاب رنگی برای کودکان ۳ تا ۷ سال.", "تصویرسازی زیبا و آموزشی."],
                },
            },
            {
                fa: "لوازم تحریر",
                en: "Stationery",
                slugBase: "bk-stationery",
                products: {
                    namePatternFa: "{model} {brand}",
                    namePatternEn: "{brand} {model}",
                    priceMin: 100_000,
                    priceMax: 2_000_000,
                    brands: ["Faber-Castell", "Stabilo", "Parker", "Cross", "Pilot"],
                    models: ["دفتر ۱۰۰ برگ", "خودکار ست ۳ تایی", "روان نویس", "مداد رنگی ۱۲ رنگ", "خط‌کش هندسی"],
                    blurbs: ["محصول باکیفیت برای استفاده روزمره.", "مناسب دانش‌آموزان و دانشجویان."],
                },
            },
        ],
    },
    {
        fa: "ورزش و اوقات فراغت",
        en: "Sports & Outdoors",
        slugBase: "bk-sports",
        children: [
            {
                fa: "تناسب اندام",
                en: "Fitness",
                slugBase: "bk-fitness",
                children: [
                    {
                        fa: "تشک یوگا",
                        en: "Yoga Mats",
                        slugBase: "bk-yoga-mats",
                        products: {
                            namePatternFa: "تشک یوگا {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Yoga Mat",
                            priceMin: 600_000,
                            priceMax: 3_500_000,
                            brands: ["Adidas", "Reebok", "Nike", "Calibra Sport", "Liforme"],
                            models: ["Premium 6mm", "Pro 4mm", "Eco Friendly", "Travel 2mm", "Studio"],
                            blurbs: ["تشک یوگا ضد لغزش.", "مناسب پیلاتس و یوگا."],
                        },
                    },
                    {
                        fa: "دمبل و وزنه",
                        en: "Dumbbells",
                        slugBase: "bk-dumbbells",
                        products: {
                            namePatternFa: "دمبل {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Dumbbells",
                            priceMin: 1_500_000,
                            priceMax: 18_000_000,
                            brands: ["Bodybuilding", "Adidas", "Domyos", "Reebok"],
                            models: ["5kg جفت", "10kg جفت", "20kg تنظیمی", "روکش‌دار", "هگزاگونال"],
                            blurbs: ["دمبل با روکش لاستیکی.", "مناسب تمرینات خانگی."],
                        },
                    },
                ],
            },
            {
                fa: "کمپینگ و طبیعت‌گردی",
                en: "Camping & Hiking",
                slugBase: "bk-camping",
                children: [
                    {
                        fa: "چادر کوهنوردی",
                        en: "Tents",
                        slugBase: "bk-tents",
                        products: {
                            namePatternFa: "چادر کوهنوردی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Camping Tent",
                            priceMin: 4_500_000,
                            priceMax: 35_000_000,
                            brands: ["Snow Hawk", "Coleman", "The North Face", "Quechua"],
                            models: ["۲ نفره", "۴ نفره", "۶ نفره", "زمستانی", "اتومات"],
                            blurbs: ["چادر کوهنوردی ضد آب.", "نصب آسان."],
                        },
                    },
                    {
                        fa: "کوله پشتی کوهنوردی",
                        en: "Hiking Backpacks",
                        slugBase: "bk-hiking-backpacks",
                        products: {
                            namePatternFa: "کوله پشتی کوهنوردی {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Hiking Backpack",
                            priceMin: 2_500_000,
                            priceMax: 22_000_000,
                            brands: ["Deuter", "Osprey", "Quechua", "Snow Hawk"],
                            models: ["40 لیتری", "60 لیتری", "80 لیتری", "روزانه", "تک روزه"],
                            blurbs: ["کوله پشتی با فریم داخلی.", "تخلیه و دسترسی آسان."],
                        },
                    },
                ],
            },
            {
                fa: "دوچرخه",
                en: "Cycling",
                slugBase: "bk-cycling",
                products: {
                    namePatternFa: "دوچرخه {brand} مدل {model}",
                    namePatternEn: "{brand} {model} Bicycle",
                    priceMin: 8_000_000,
                    priceMax: 80_000_000,
                    brands: ["Giant", "Merida", "Trek", "Cannondale", "Specialized"],
                    models: ["ATX 27.5", "Big.Seven 80", "FX 3 Disc", "Quick CX", "Sirrus"],
                    blurbs: ["دوچرخه کوهستان ۲۹ اینچ.", "تنه آلیاژی و ۲۱ دنده."],
                },
            },
        ],
    },
    {
        fa: "اسباب‌بازی و کودک",
        en: "Toys & Baby",
        slugBase: "bk-toys-baby",
        children: [
            {
                fa: "اسباب‌بازی",
                en: "Toys",
                slugBase: "bk-toys",
                children: [
                    {
                        fa: "اکشن فیگور",
                        en: "Action Figures",
                        slugBase: "bk-action-figures",
                        products: {
                            namePatternFa: "اکشن فیگور {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Action Figure",
                            priceMin: 600_000,
                            priceMax: 8_500_000,
                            brands: ["Marvel", "DC", "Star Wars", "Disney", "Bandai"],
                            models: ["Iron Man", "Batman", "Spider-Man", "Captain America", "Darth Vader"],
                            blurbs: ["اکشن فیگور با جزییات بالا.", "قابل حرکت در همه مفاصل."],
                        },
                    },
                    {
                        fa: "بازی فکری",
                        en: "Board Games",
                        slugBase: "bk-board-games",
                        products: {
                            namePatternFa: "بازی فکری {model}",
                            namePatternEn: "{model} Board Game",
                            priceMin: 1_500_000,
                            priceMax: 8_500_000,
                            brands: ["Catan", "Monopoly", "Risk", "Scrabble", "Uno"],
                            models: ["نسخه فارسی", "نسخه کلاسیک", "نسخه جدید", "نسخه خانوادگی", "نسخه دوستانه"],
                            blurbs: ["بازی فکری برای ۲ تا ۶ نفر.", "مناسب از ۸ سال به بالا."],
                        },
                    },
                ],
            },
            {
                fa: "مراقبت کودک",
                en: "Baby Care",
                slugBase: "bk-baby-care",
                children: [
                    {
                        fa: "پوشک کودک",
                        en: "Diapers",
                        slugBase: "bk-diapers",
                        products: {
                            namePatternFa: "پوشک {brand} سایز {model}",
                            namePatternEn: "{brand} {model} Diapers",
                            priceMin: 800_000,
                            priceMax: 4_500_000,
                            brands: ["Pampers", "Huggies", "Molfix", "Joonies", "MyBaby"],
                            models: ["۲", "۳", "۴", "۵", "Pull Up"],
                            blurbs: ["پوشک بچه با جذب بالا.", "ضد حساسیت پوست."],
                        },
                    },
                    {
                        fa: "کالسکه",
                        en: "Strollers",
                        slugBase: "bk-strollers",
                        products: {
                            namePatternFa: "کالسکه {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Stroller",
                            priceMin: 8_000_000,
                            priceMax: 50_000_000,
                            brands: ["Graco", "Chicco", "Cybex", "Maxi-Cosi", "Joie"],
                            models: ["Modes Pramette", "Bravo Trio", "Balios S", "Stradafix", "Litetrax 4"],
                            blurbs: ["کالسکه دو طرفه با تشک قابل تنظیم.", "مناسب از ۰ تا ۳ سال."],
                        },
                    },
                ],
            },
        ],
    },
    {
        fa: "خودرو",
        en: "Automotive",
        slugBase: "bk-auto",
        children: [
            {
                fa: "مراقبت خودرو",
                en: "Car Care",
                slugBase: "bk-car-care",
                children: [
                    {
                        fa: "روغن موتور",
                        en: "Engine Oil",
                        slugBase: "bk-engine-oil",
                        products: {
                            namePatternFa: "روغن موتور {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Engine Oil",
                            priceMin: 1_500_000,
                            priceMax: 8_500_000,
                            brands: ["Behran", "Iranol", "Total", "Mobil", "Castrol"],
                            models: ["20W-50", "10W-40", "5W-30 سینتتیک", "0W-20 فول‌سینتتیک"],
                            blurbs: ["روغن موتور ۴ لیتری.", "مناسب خودروهای داخلی و خارجی."],
                        },
                    },
                    {
                        fa: "لاستیک خودرو",
                        en: "Tires",
                        slugBase: "bk-tires",
                        products: {
                            namePatternFa: "لاستیک خودرو {brand} مدل {model}",
                            namePatternEn: "{brand} {model} Tire",
                            priceMin: 6_500_000,
                            priceMax: 25_000_000,
                            brands: ["Yazd Tire", "Kavir", "Iran Tire", "Hankook", "Bridgestone"],
                            models: ["205/55 R16", "195/65 R15", "215/60 R17", "225/45 R17"],
                            blurbs: ["لاستیک خودرو سواری.", "تولید ۱۴۰۲."],
                        },
                    },
                ],
            },
            {
                fa: "لوازم جانبی خودرو",
                en: "Car Accessories",
                slugBase: "bk-car-accessories",
                products: {
                    namePatternFa: "{model} خودرو {brand}",
                    namePatternEn: "{brand} {model}",
                    priceMin: 800_000,
                    priceMax: 8_500_000,
                    brands: ["Calibra Auto", "Bosch", "Philips", "Hella"],
                    models: ["دوربین داشبورد", "ضبط خودرو", "هواکش", "روکش صندلی", "کابل باطری"],
                    blurbs: ["لوازم جانبی خودرو با کیفیت.", "نصب ساده."],
                },
            },
        ],
    },
];
