import { getTools, parseFilters, handleToolError, errorJson, json } from "@/lib/torob/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || !id.startsWith("product_")) {
      return errorJson("invalid product_id", 400, "validation_error");
    }
    const sp = new URL(req.url).searchParams;
    const filters = parseFilters(sp);
    const tools = getTools();
    const res = tools.compareOffers(id, filters);
    if (res.status === "not_found") return errorJson("product not found", 404, "not_found");
    return json(res);
  } catch (e) {
    return handleToolError(e);
  }
}
