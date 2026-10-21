import { getTools, handleToolError, errorJson, json } from "@/lib/torob/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorJson("invalid JSON body", 400, "validation_error");
    }
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || items.length === 0) {
      return errorJson("items must be a non-empty array of {product_id}", 400, "validation_error");
    }
    const start = parseStart(body?.start);
    const maxShops = Number(body?.max_shops ?? 3) || 3;
    const tools = getTools();
    const res = tools.planShoppingTrip(items, start, maxShops);
    return json(res);
  } catch (e) {
    return handleToolError(e);
  }
}

function parseStart(start: any): [number, number] | undefined {
  if (!start) return undefined;
  const lat = Number(start.lat ?? start[0]);
  const lon = Number(start.lon ?? start[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return [lat, lon];
}
