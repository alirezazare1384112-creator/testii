import { json } from "@/lib/torob/api-helpers";
import Database from "better-sqlite3";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = new Database(resolve(process.cwd(), "data/torob.sqlite"), { readonly: true });
  const counts = {
    shops: (db.prepare("SELECT COUNT(*) c FROM shops").get() as any).c,
    products: (db.prepare("SELECT COUNT(*) c FROM products").get() as any).c,
    offers: (db.prepare("SELECT COUNT(*) c FROM offers").get() as any).c,
  };
  const priceStatus = db
    .prepare("SELECT price_status, COUNT(*) c FROM offers GROUP BY price_status")
    .all() as any[];
  const categories = db
    .prepare("SELECT category, COUNT(*) c FROM products GROUP BY category ORDER BY c DESC LIMIT 12")
    .all() as any[];
  const priceBounds = db
    .prepare("SELECT MIN(price_toman) lo, MAX(price_toman) hi FROM offers WHERE price_status='ok'")
    .get() as any;
  const meta = Object.fromEntries(
    (db.prepare("SELECT key, value FROM meta").all() as any[]).map((r) => [r.key, r.value])
  );
  db.close();
  return json({
    counts,
    price_status: Object.fromEntries(priceStatus.map((r) => [r.price_status, r.c])),
    price_bounds_ok: { min: priceBounds?.lo ?? null, max: priceBounds?.hi ?? null },
    categories,
    meta,
  });
}
