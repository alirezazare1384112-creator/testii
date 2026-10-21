import { getTools, handleToolError, errorJson, json } from "@/lib/torob/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || !id.startsWith("product_")) {
      return errorJson("invalid product_id", 400, "validation_error");
    }
    const tools = getTools();
    const res = tools.getProductDetails(id);
    if (res === null) return errorJson("product not found", 404, "not_found");
    return json(res);
  } catch (e) {
    return handleToolError(e);
  }
}
