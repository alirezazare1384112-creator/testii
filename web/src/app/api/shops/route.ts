import { getTools, parseFilters, handleToolError, json } from "@/lib/torob/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const filters = parseFilters(sp);
    const tools = getTools();
    const res = tools.findShops(filters);
    return json(res);
  } catch (e) {
    return handleToolError(e);
  }
}
