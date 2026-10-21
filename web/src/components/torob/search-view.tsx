"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Filter, Loader2, PackageX, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatNumber, toPersianDigits } from "./format";
import { ProductCard } from "./product-card";
import { NEIGHBORHOODS, type Neighborhood, type SearchResponse, type SortOption } from "./types";

export interface SearchFiltersState {
  q: string;
  min_price: number | null;
  max_price: number | null;
  near: Neighborhood | "all";
  radius_km: number;
  fast_delivery: boolean;
  sort: SortOption;
}

export const DEFAULT_SEARCH_FILTERS: SearchFiltersState = {
  q: "",
  min_price: null,
  max_price: null,
  near: "all",
  radius_km: 5,
  fast_delivery: false,
  sort: "relevance",
};

const PAGE_SIZE = 12;

function buildUrl(filters: SearchFiltersState, offset: number): string {
  const sp = new URLSearchParams();
  sp.set("q", filters.q);
  sp.set("limit", String(PAGE_SIZE));
  sp.set("offset", String(offset));
  sp.set("sort", filters.sort);
  if (filters.min_price !== null) sp.set("min_price", String(filters.min_price));
  if (filters.max_price !== null) sp.set("max_price", String(filters.max_price));
  if (filters.near !== "all") {
    sp.set("near", filters.near);
    sp.set("radius_km", String(filters.radius_km));
  }
  if (filters.fast_delivery) sp.set("fast_delivery", "1");
  return `/api/search?${sp.toString()}`;
}

async function fetchSearch(url: string): Promise<SearchResponse> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<SearchResponse>;
}

function FiltersPanel({
  filters,
  onChange,
  onApply,
}: {
  filters: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  onApply: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Filter className="size-4" aria-hidden />
        فیلترها
      </div>

      {/* Sort */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sort">ترتیب</Label>
        <Select
          value={filters.sort}
          onValueChange={(v) => onChange({ ...filters, sort: v as SortOption })}
        >
          <SelectTrigger id="sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">مرتبط‌ترین</SelectItem>
            <SelectItem value="price_asc">ارزان‌ترین</SelectItem>
            <SelectItem value="price_desc">گران‌ترین</SelectItem>
            <SelectItem value="distance">نزدیک‌ترین</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Price range */}
      <div className="flex flex-col gap-2">
        <Label>محدوده قیمت (تومان)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="حداقل"
            value={filters.min_price ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...filters, min_price: v === "" ? null : Math.max(0, Number(v)) });
            }}
            aria-label="حداقل قیمت"
          />
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="حداکثر"
            value={filters.max_price ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...filters, max_price: v === "" ? null : Math.max(0, Number(v)) });
            }}
            aria-label="حداکثر قیمت"
          />
        </div>
      </div>

      {/* Near */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="near">محله</Label>
        <Select
          value={filters.near}
          onValueChange={(v) => onChange({ ...filters, near: v as Neighborhood | "all" })}
        >
          <SelectTrigger id="near" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه تهران</SelectItem>
            {NEIGHBORHOODS.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Radius */}
      {filters.near !== "all" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="radius">شعاع (کیلومتر)</Label>
            <Badge variant="secondary" className="font-num">
              {toPersianDigits(filters.radius_km)}
            </Badge>
          </div>
          <Slider
            id="radius"
            min={1}
            max={20}
            step={1}
            value={[filters.radius_km]}
            onValueChange={(v) => onChange({ ...filters, radius_km: v[0] })}
          />
        </div>
      )}

      {/* Fast delivery */}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="fast" className="text-sm">فقط ارسال سریع</Label>
        <Switch
          id="fast"
          checked={filters.fast_delivery}
          onCheckedChange={(c) => onChange({ ...filters, fast_delivery: c })}
        />
      </div>

      <Button type="button" className="min-h-11" onClick={onApply}>
        اعمال فیلترها
      </Button>
    </Card>
  );
}

export function SearchView({
  filters,
  onFiltersChange,
  onSelectProduct,
}: {
  filters: SearchFiltersState;
  onFiltersChange: (next: SearchFiltersState) => void;
  onSelectProduct: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState<SearchFiltersState>(filters);
  const [applied, setApplied] = React.useState<SearchFiltersState>(filters);
  const [offset, setOffset] = React.useState(0);
  const [data, setData] = React.useState<SearchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // keep draft in sync when navigating back into the view (filters already set)
  React.useEffect(() => {
    setDraft(filters);
    setApplied(filters);
    setOffset(0);
  }, [filters]);

  const doFetch = React.useCallback(async (f: SearchFiltersState, off: number) => {
    if (!f.q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSearch(buildUrl(f, off));
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    doFetch(applied, offset);
  }, [applied, offset, doFetch]);

  const apply = () => {
    setApplied(draft);
    onFiltersChange(draft);
    setOffset(0);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;
  const isEmpty = !loading && data && (data.status !== "ok" || items.length === 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">
          نتایج جست‌وجو
          {filters.q && <span className="mr-2 text-muted-foreground">— «{filters.q}»</span>}
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? (
            "در حال بارگذاری…"
          ) : data ? (
            <>
              <span className="font-num">{formatNumber(total)}</span> نتیجه
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FiltersPanel
            filters={draft}
            onChange={setDraft}
            onApply={apply}
          />
        </aside>

        {/* Results */}
        <section className="flex flex-col gap-4" aria-label="نتایج جست‌وجو">
          {error && (
            <Card className="border-destructive/40 p-4 text-sm text-destructive">
              خطا در بارگذاری نتایج: {error}
            </Card>
          )}

          {loading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" />
              ))}
            </div>
          )}

          {!loading && isEmpty && (
            <Card className="flex flex-col items-center gap-3 p-8 text-center">
              <PackageX className="size-10 text-muted-foreground" aria-hidden />
              <p className="text-base font-medium">نتیجه‌ای یافت نشد</p>
              <p className="max-w-md text-sm text-muted-foreground">
                پرس‌وجو یا فیلترها را گسترده‌تر کنید؛ مثلاً محله یا محدودۀ قیمت را
                تغییر دهید، یا عبارت کوتاه‌تر و عمومی‌تری را امتحان کنید.
              </p>
            </Card>
          )}

          {!loading && !isEmpty && items.length > 0 && (
            <motion.div
              key={`${applied.q}-${offset}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {items.map((it) => (
                <ProductCard key={it.product_id} item={it} onSelect={onSelectProduct} />
              ))}
            </motion.div>
          )}

          {/* Pagination */}
          {!loading && items.length > 0 && (
            <nav className="mt-2 flex items-center justify-center gap-2" aria-label="صفحه‌بندی">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="min-h-11"
              >
                <ChevronRight className="size-4" aria-hidden />
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground font-num">
                صفحه {toPersianDigits(Math.floor(offset / PAGE_SIZE) + 1)} از{" "}
                {toPersianDigits(Math.max(1, Math.ceil(total / PAGE_SIZE)))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="min-h-11"
              >
                بعدی
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
            </nav>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              در حال بارگذاری…
            </div>
          )}

          {!loading && !data && !error && (
            <Card className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <Search className="size-8" aria-hidden />
              <p className="text-sm">برای شروع جست‌وجو، یک عبارت وارد کنید.</p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
