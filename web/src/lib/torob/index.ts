/**
 * Shared, lazily-created ShoppingTools singleton for API routes.
 *
 * Next.js route handlers run under Node (the `next` CLI is a node script even
 * when launched via `bun run dev`). We open the SQLite DB read-only and keep
 * a single connection per process to avoid reopening on every request.
 */
import { ShoppingTools, DEFAULT_DB } from "./tools";

let _tools: ShoppingTools | null = null;

export function getTools(): ShoppingTools {
  if (!_tools) {
    _tools = new ShoppingTools(DEFAULT_DB);
  }
  return _tools;
}

export type {
  ShoppingTools,
  Filters,
  SearchResponse,
  ProductDetails,
  CompareResponse,
  ShopsResponse,
  AlternativesResponse,
  TripResponse,
  Offer,
  Shop,
  SearchItem,
} from "./tools";

export { haversineKm, resolveLocation, validateFilters, NEIGHBORHOODS } from "./tools";
export { normalizeText, parseBudgetToman, parseQuery, cleanNull } from "./normalize";
