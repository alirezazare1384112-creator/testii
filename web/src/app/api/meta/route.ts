import { json } from "@/lib/torob/api-helpers";
import Database from "better-sqlite3";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = new Database(resolve(process.cwd(), "data/torob.sqlite"), { readonly: true });
  const meta = Object.fromEntries(
    (db.prepare("SELECT key, value FROM meta").all() as any[]).map((r) => [r.key, r.value])
  );
  db.close();
  return json({
    is_synthetic: meta.is_synthetic === "true",
    source: meta.source ?? null,
    note: meta.note ?? null,
    imported_at: meta.imported_at ?? null,
    price_bounds_toman: meta.price_bounds_toman ?? null,
    counts: {
      shops: Number(meta.count_shops ?? 0),
      products: Number(meta.count_products ?? 0),
      offers: Number(meta.count_offers ?? 0),
    },
  });
}
