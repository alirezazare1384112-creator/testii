import { getTools, parseFilters, handleToolError, json } from "@/lib/torob/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const query = sp.get("q") || "";
    const filters = parseFilters(sp);
    const tools = getTools();
    const res = tools.searchProducts(query, filters);
    return json(res);
  } catch (e) {
    return handleToolError(e);
  }
}
