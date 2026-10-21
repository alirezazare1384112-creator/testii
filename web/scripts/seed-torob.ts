/**
 * Deterministic synthetic Persian sample for the Torobgard project.
 *
 * The real `torob-dataset.zip` / `data/torob.sqlite` are not available in this
 * sandbox (gitignored build artifacts; sandbox cannot reach torob.com). This
 * script builds a small but representative SQLite DB with the EXACT schema from
 * `tehran_agent/importer.py` so the real DB can be dropped in later with no
 * code changes.
 *
 * Run:  bun run scripts/seed-torob.ts
 *
 * Reproducible: seeded PRNG, fixed counts. Includes the dataset's known quirks:
 *   - the "ماوس بی‌سیم" (wireless) vs "ماوس با سیم" (wired) pair, to demonstrate
 *     the phrase-match fix (wireless query must NOT return wired titles).
 *   - accessory titles like "ماوس پد" that should be demoted, not removed.
 *   - missing prices (~4.5%), implausible prices (<1k, >10B), and a 2020-2026
 *     spread of `price_changed_at` timestamps.
 *   - synthetic shop names (flagged in the UI).
 *   - missing brand (74.5%), missing model (98%), missing fast_delivery (75%).
 */
import Database from "better-sqlite3";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// --- Deterministic PRNG (mulberry32) ---------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20241021);
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

const DB_PATH = resolve("data/torob.sqlite");

// --- Schema (verbatim from importer.py) -----------------------------------
const SCHEMA = `
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS shops;
DROP TABLE IF EXISTS meta;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE products (
    product_id   TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    title_norm   TEXT NOT NULL,
    brand        TEXT,
    category     TEXT,
    model        TEXT,
    image_urls   TEXT,
    specs        TEXT,
    spec_count   INTEGER NOT NULL
);

CREATE TABLE shops (
    shop_id              TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    address              TEXT,
    location_label       TEXT,
    lat                  REAL,
    lon                  REAL,
    category_names       TEXT,
    contacts             TEXT,
    website_url          TEXT,
    instagram            TEXT,
    supports_fast_delivery INTEGER,
    weekly_hours         TEXT,
    payment_options      TEXT
);

CREATE TABLE offers (
    offer_id          TEXT PRIMARY KEY,
    product_id        TEXT NOT NULL REFERENCES products(product_id),
    shop_id           TEXT NOT NULL REFERENCES shops(shop_id),
    price_toman       REAL,
    price_status      TEXT NOT NULL,
    price_changed_at  TEXT,
    seller_title      TEXT,
    description       TEXT,
    warranty          TEXT
);

CREATE INDEX idx_offers_product ON offers(product_id);
CREATE INDEX idx_offers_shop ON offers(shop_id);
CREATE INDEX idx_offers_price ON offers(price_toman);
CREATE INDEX idx_products_norm ON products(title_norm);
CREATE INDEX idx_shops_geo ON shops(lat, lon);
`;

// --- Persian normalize (mirrors normalize.py for title_norm) --------------
const CHAR_MAP: Record<string, string> = {
  ي: "ی", ك: "ک", ۑ: "ه", ة: "ه",
  "\u200c": " ", "\u200f": " ", "\u200e": " ", "\u0640": "",
};
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function normalizeText(value: string): string {
  if (!value) return "";
  let v = "";
  for (const ch of value) {
    if (CHAR_MAP[ch] !== undefined) v += CHAR_MAP[ch];
    else {
      const pd = PERSIAN_DIGITS.indexOf(ch);
      const ad = ARABIC_DIGITS.indexOf(ch);
      if (pd >= 0) v += String(pd);
      else if (ad >= 0) v += String(ad);
      else v += ch;
    }
  }
  v = v.toLowerCase();
  v = v.replace(/[\u064B-\u065F]/g, ""); // strip Arabic diacritics
  // JS \w is ASCII-only (unlike Python), so use Unicode property escapes to
  // preserve Persian letters/digits while dropping punctuation.
  v = v.replace(/[^\p{L}\p{N}\s./-]/gu, " ");
  return v.replace(/\s+/g, " ").trim();
}

// --- Tehran geography (from DATA_AUDIT.md: lat 35.64-35.81, lon 51.31-51.51)
type Coord = [number, number];
const NEIGHBORHOODS: { name: string; c: Coord; label: string }[] = [
  { name: "صادقیه", c: [35.7467, 51.336], label: "صادقیه" },
  { name: "ولنجک", c: [35.779, 51.387], label: "ولنجک" },
  { name: "ونک", c: [35.765, 51.412], label: "ونک" },
  { name: "میدان ولیعصر", c: [35.6997, 51.413], label: "میدان ولیعصر" },
  { name: "تجریش", c: [35.805, 51.43], label: "تجریش" },
  { name: "شریعتی", c: [35.76, 51.433], label: "شریعتی" },
  { name: "جمهوری", c: [35.702, 51.39], label: "جمهوری" },
  { name: "ناصرخسرو", c: [35.689, 51.39], label: "ناصرخسرو" },
  { name: "افسریه", c: [35.672, 51.443], label: "افسریه" },
  { name: "هرند", c: [35.74, 51.49], label: "هرند" },
  { name: "جردن", c: [35.758, 51.418], label: "جردن" },
  { name: "قیطریه", c: [35.79, 51.445], label: "قیطریه" },
];
function jitterCoord(c: Coord, km: number): Coord {
  const [lat, lon] = c;
  const dlat = (rnd() - 0.5) * (km / 111);
  const dlon = (rnd() - 0.5) * (km / (111 * Math.cos((lat * Math.PI) / 180)));
  return [lat + dlat, lon + dlon];
}

// --- Catalog of product categories/titles (Persian) -----------------------
type Seed = { category: string; brand: string | null; model: string | null; title: string; basePrice: number };
const CATALOG: Seed[] = [
  // Wireless mice (matched by "ماوس بی‌سیم", excluded by "ماوس با سیم")
  { category: "ماوس", brand: "لاجیتک", model: "M650", title: "ماوس بی‌سیم لاجیتک M650", basePrice: 1_200_000 },
  { category: "ماوس", brand: "رازر", model: "DeathAdder", title: "ماوس بی‌سیم رازر DeathAdder V2", basePrice: 3_800_000 },
  { category: "ماوس", brand: "مایکروسافت", model: "Surface", title: "ماوس بی‌سیم مایکروسافت Surface", basePrice: 2_500_000 },
  { category: "ماوس", brand: "ایپکس", model: null, title: "ماوس بی‌سیم ایپکس گیمینگ", basePrice: 850_000 },
  { category: "ماوس", brand: "لایون", model: null, title: "ماوس بی‌سیم لایون اداری", basePrice: 320_000 },
  { category: "ماوس", brand: "دل", model: "WM126", title: "ماوس بی‌سیم دل WM126", basePrice: 480_000 },
  { category: "ماوس", brand: "ایسوس", model: "WT425", title: "ماوس بی‌سیم ایسوس WT425", basePrice: 690_000 },
  { category: "ماوس", brand: "پیکسو", model: null, title: "ماوس بی‌سیم پیکسو کامپکت", basePrice: 220_000 },
  // Wired mice (matched by "ماوس با سیم", excluded by "ماوس بی‌سیم")
  { category: "ماوس", brand: "لاجیتک", model: "B100", title: "ماوس با سیم لاجیتک B100", basePrice: 180_000 },
  { category: "ماوس", brand: "مایکروسافت", model: "100", title: "ماوس با سیم مایکروسافت 100", basePrice: 240_000 },
  { category: "ماوس", brand: "ایسوس", model: "ROG", title: "ماوس با سیم ایسوس ROG Sica", basePrice: 1_400_000 },
  { category: "ماوس", brand: "گنیوس", model: "DX110", title: "ماوس با سیم گنیوس DX110", basePrice: 95_000 },
  { category: "ماوس", brand: "ایپکس", model: "M8", title: "ماوس با سیم ایپکس M8 گیمینگ", basePrice: 560_000 },
  // Quiet/silent mouse that contains "بی‌صدا" but is WIRED — the classic false-positive case
  { category: "ماوس", brand: "فانتک", model: null, title: "ماوس بی‌صدا با سیم فانتک", basePrice: 310_000 },
  // Accessory that should be demoted, not removed, for "ماوس" search
  { category: "لوازم جانبی ماوس", brand: null, model: null, title: "ماوس پد گیمینگ بزرگ", basePrice: 350_000 },
  { category: "لوازم جانبی ماوس", brand: "رازر", model: null, title: "ماوس پد رازر Goliathus", basePrice: 620_000 },

  // Keyboards
  { category: "کیبورد", brand: "لاجیتک", model: "K380", title: "کیبورد بی‌سیم لاجیتک K380", basePrice: 2_100_000 },
  { category: "کیبورد", brand: "رپو", model: "R5", title: "کیبورد مکانیکی با سیم رپو R5", basePrice: 1_900_000 },
  { category: "کیبورد", brand: "مایکروسافت", model: "800", title: "کیبورد بی‌سیم مایکروسافت 800", basePrice: 1_150_000 },
  { category: "کیبورد", brand: "هیوندای", model: null, title: "کیبورد با سیم هیوندای", basePrice: 240_000 },

  // Laptops
  { category: "لپ‌تاپ", brand: "ایسوس", model: "VivoBook", title: "لپ‌تاپ ایسوس VivoBook 15", basePrice: 28_000_000 },
  { category: "لپ‌تاپ", brand: "لنوو", model: "IdeaPad", title: "لپ‌تاپ لنوو IdeaPad 3", basePrice: 24_500_000 },
  { category: "لپ‌تاپ", brand: "اپل", model: "MBA", title: "لپ‌تاپ اپل MacBook Air M2", basePrice: 89_000_000 },
  { category: "لپ‌تاپ", brand: "ایسر", model: "Aspire", title: "لپ‌تاپ ایسر Aspire 5", basePrice: 21_000_000 },
  { category: "لپ‌تاپ", brand: "اچ‌پی", model: "Pavilion", title: "لپ‌تاپ اچ‌پی Pavilion", basePrice: 31_000_000 },

  // Phones
  { category: "موبایل", brand: "سامسونگ", model: "A54", title: "گوشی موبایل سامسونگ Galaxy A54", basePrice: 18_500_000 },
  { category: "موبایل", brand: "شیائومی", model: "Redmi 12", title: "گوشی موبایل شیائومی Redmi 12", basePrice: 8_900_000 },
  { category: "موبایل", brand: "اپل", model: "iPhone 13", title: "گوشی موبایل اپل iPhone 13", basePrice: 72_000_000 },

  // Headphones
  { category: "هدفون", brand: "جی‌بی‌ال", model: "Tune", title: "هدفون بی‌سیم جی‌بی‌ال Tune", basePrice: 3_200_000 },
  { category: "هدفون", brand: "سونی", model: "WH1000", title: "هدفون بی‌سیم سونی WH-1000", basePrice: 24_000_000 },
  { category: "هدفون", brand: "ایپکس", model: null, title: "هدفون با سیم ایپکس استودیو", basePrice: 680_000 },

  // Household
  { category: "یخچال", brand: "ال‌جی", model: null, title: "یخچال فریزر ال‌جی دو درب", basePrice: 95_000_000 },
  { category: "ماشین لباسشویی", brand: "بوش", model: null, title: "ماشین لباسشویی بوش ۸ کیلو", basePrice: 68_000_000 },
  { category: "تلویزیون", brand: "سامسونگ", model: "55", title: "تلویزیون سامسونگ 55 اینچ QLED", basePrice: 42_000_000 },
  { category: "جاروبرقی", brand: "فیلیپس", model: null, title: "جاروبرقی فیلیپس بی‌سیم", basePrice: 14_500_000 },
];

const SHOP_NAME_PARTS_A = ["فروشگاه", "پاساژ", "مرکز", "دیجی", "تک", "سپهر", "آوا", "نیکا", "پارس", "مهر"];
const SHOP_NAME_PARTS_B = ["الکترونیک", "دیجیتال", "کامپیوتر", "موبایل", "تکنولوژی", "الکترو", "نوین"];

const PAYMENT_OPTIONS = ["نقدی", "نقدی، کارت به کارت", "نقدی، اقساطی", "نقدی، چک"];
const HOURS = [
  "شنبه تا پنجشنبه ۱۰ تا ۲۰",
  "هر روز ۹ تا ۲۱",
  "شنبه تا چهارشنبه ۹ تا ۱۸",
  "یکشنبه تا جمعه ۱۱ تا ۲۲",
];

const PRICE_MIN_OK = 1_000;
const PRICE_MAX_OK = 10_000_000_000;

function classifyPrice(raw: number | null): { price: number | null; status: string } {
  if (raw === null) return { price: null, status: "missing" };
  if (raw < PRICE_MIN_OK) return { price: raw, status: "too_low" };
  if (raw > PRICE_MAX_OK) return { price: raw, status: "too_high" };
  return { price: raw, status: "ok" };
}

function isoDate(year: number): string {
  const m = ri(1, 12);
  const d = ri(1, 28);
  const hh = ri(0, 23).toString().padStart(2, "0");
  const mm = ri(0, 59).toString().padStart(2, "0");
  const ss = ri(0, 59).toString().padStart(2, "0");
  return `${year}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}T${hh}:${mm}:${ss}Z`;
}

// --- Build ----------------------------------------------------------------
rmSync(DB_PATH, { force: true });
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.exec(SCHEMA);

// Shops: ~220
const SHOP_COUNT = 220;
const shopRows: any[] = [];
for (let i = 0; i < SHOP_COUNT; i++) {
  const nb = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
  const [lat, lon] = jitterCoord(nb.c, 3.5);
  const name = `${pick(SHOP_NAME_PARTS_A)} ${pick(SHOP_NAME_PARTS_B)} ${nb.name}`;
  const fast = rnd() < 0.25 ? 1 : null; // ~75% unknown (NULL)
  shopRows.push([
    `shop_${i + 1}`,
    name,
    `${nb.label}، خیابان ${ri(1, 40)}`,
    nb.label,
    Number(lat.toFixed(6)),
    Number(lon.toFixed(6)),
    JSON.stringify(["دیجیتال", "کامپیوتر", "موبایل"].slice(0, ri(1, 3))),
    JSON.stringify({ phone: `021-${ri(10000000, 99999999)}` }),
    rnd() < 0.02 ? `https://shop${i + 1}.ir` : null,
    rnd() < 0.005 ? `shop_${i + 1}` : null,
    fast,
    pick(HOURS),
    pick(PAYMENT_OPTIONS),
  ]);
}
const insShop = db.prepare("INSERT INTO shops VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
db.transaction((rows: any[][]) => { for (const r of rows) insShop.run(...r); })(shopRows);

// Products: catalog expanded with variants to reach ~1500
const productRows: any[] = [];
let pidx = 0;
const priceList: { pid: string; basePrice: number }[] = [];
function addProduct(s: Seed, suffix?: string, priceMul = 1) {
  pidx++;
  const pid = `product_${pidx}`;
  const title = suffix ? `${s.title} ${suffix}` : s.title;
  const brand = s.brand && rnd() > 0.745 ? s.brand : null; // ~25.5% keep brand
  const model = s.model && rnd() > 0.98 ? s.model : null; // ~2% keep model
  const imgCount = ri(0, 3);
  const image_urls = JSON.stringify(
    Array.from({ length: imgCount }, (_, k) => `https://picsum.photos/seed/${pid}_${k}/400/400`)
  );
  const specCount = rnd() < 0.36 ? 0 : ri(1, 5);
  const specs = JSON.stringify(
    Array.from({ length: specCount }, () => ({
      section: pick(["مشخصات اصلی", "اطلاعات فنی", "عمومی"]),
      key: pick(["نوع اتصال", "رنگ", "گارانتی", "وزن", "ابعاد"]),
      value: pick(["بی‌سیم", "با سیم", "مشکی", "سفید", "یک سال", "کم", "استاندارد"]),
    }))
  );
  productRows.push([pid, title, normalizeText(title), brand, s.category, model, image_urls, specs, specCount]);
  priceList.push({ pid, basePrice: s.basePrice * priceMul });
}
for (const s of CATALOG) {
  addProduct(s);
  for (let v = 0; v < 85; v++) {
    const mul = 0.7 + rnd() * 1.6;
    const cap = s.title.includes("گوشی موبایل") ? "" : `نسخه ${ri(2, 9)}`;
    addProduct(s, cap || undefined, mul);
  }
}
const insProduct = db.prepare("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)");
db.transaction((rows: any[][]) => { for (const r of rows) insProduct.run(...r); })(productRows);

// Offers: ~4000
let oidx = 0;
const offerStmt = db.prepare("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?)");
const insertOffer = db.transaction((batch: any[][]) => { for (const r of batch) offerStmt.run(...r); });
let batch: any[][] = [];
let offerCount = 0;
for (const { pid, basePrice } of priceList) {
  const n = ri(1, 4);
  for (let k = 0; k < n; k++) {
    oidx++;
    const sid = `shop_${ri(1, SHOP_COUNT)}`;
    let rawPrice: number | null = basePrice * (0.8 + rnd() * 0.6);
    const r = rnd();
    if (r < 0.045) rawPrice = null; // ~4.5% missing
    else if (r < 0.05) rawPrice = ri(50, 999); // too_low
    else if (r < 0.052) rawPrice = 10_000_000_001 + ri(0, 1_000_000_000); // too_high
    const { price, status } = classifyPrice(rawPrice);
    const year = 2020 + ri(0, 6); // 2020..2026
    const changed = r < 0.045 ? null : isoDate(year);
    batch.push([
      `offer_${oidx}`,
      pid,
      sid,
      price,
      status,
      changed,
      `${pick(SHOP_NAME_PARTS_A)} ${pick(SHOP_NAME_PARTS_B)}`,
      rnd() < 0.3 ? "ارسال رایگان به سراسر تهران" : null,
      rnd() < 0.18 ? JSON.stringify({ description: "گارانتی اصالت کالا", period: "۱۸ ماه" }) : null,
    ]);
    offerCount++;
    if (batch.length >= 1000) {
      insertOffer(batch);
      batch = [];
    }
  }
}
if (batch.length) insertOffer(batch);

// meta
const insMeta = db.prepare("INSERT INTO meta VALUES (?,?)");
db.transaction((rows: any[][]) => { for (const r of rows) insMeta.run(...r); })([
  ["imported_at", new Date().toISOString()],
  ["source", "scripts/seed-torob.ts (synthetic Persian sample)"],
  ["is_synthetic", "true"],
  ["note", "Synthetic data for development. Replace data/torob.sqlite with the real importer output for production."],
  ["price_bounds_toman", `${PRICE_MIN_OK}..${PRICE_MAX_OK}`],
  ["count_shops", String(SHOP_COUNT)],
  ["count_products", String(productRows.length)],
  ["count_offers", String(offerCount)],
]);

// Sanity report (query before closing)
const priceBreak = db.prepare("SELECT price_status, COUNT(*) c FROM offers GROUP BY price_status").all() as any[];
const distinctCats = db.prepare("SELECT COUNT(DISTINCT category) c FROM products").get() as any;
const sampleWireless = db.prepare("SELECT product_id, title FROM products WHERE title_norm LIKE ? LIMIT 5").all("%بی سیم%") as any[];
const sampleWired = db.prepare("SELECT product_id, title FROM products WHERE title_norm LIKE ? AND title_norm NOT LIKE ? LIMIT 5").all("%با سیم%", "%بی سیم%") as any[];
const totalCounts = {
  shops: (db.prepare("SELECT COUNT(*) c FROM shops").get() as any).c,
  products: (db.prepare("SELECT COUNT(*) c FROM products").get() as any).c,
  offers: (db.prepare("SELECT COUNT(*) c FROM offers").get() as any).c,
};
db.close();

const report = {
  db: DB_PATH,
  counts: totalCounts,
  price_status: Object.fromEntries(priceBreak.map((r) => [r.price_status, r.c])),
  distinct_categories: distinctCats.c,
  wireless_sample: sampleWireless,
  wired_sample: sampleWired,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(resolve("data/seed-report.json"), JSON.stringify(report, null, 2));
