"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Info, MapPin, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceKm, toPersianDigits } from "./format";
import { NEIGHBORHOOD_COORDS, NEIGHBORHOODS, type Neighborhood, type ShopItem } from "./types";

/** Tehran bounding box used for the schematic map. */
const LAT_MIN = 35.64;
const LAT_MAX = 35.81;
const LON_MIN = 51.31;
const LON_MAX = 51.51;
const VB_W = 1180;
const VB_H = 1000;
const PADDING = 40;

function lonToX(lon: number): number {
  return PADDING + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (VB_W - 2 * PADDING);
}
function latToY(lat: number): number {
  // invert: north (higher lat) at top (smaller y)
  return PADDING + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (VB_H - 2 * PADDING);
}

const NEIGHBORHOOD_LABEL_POS = (Object.keys(NEIGHBORHOOD_COORDS) as Neighborhood[]).map((n) => ({
  name: n,
  x: lonToX(NEIGHBORHOOD_COORDS[n][1]),
  y: latToY(NEIGHBORHOOD_COORDS[n][0]),
}));

/** Returns color (stroke) + radius for a shop based on matching_offers. */
function dotStyle(matching: number, max: number): { r: number; fill: string; opacity: number } {
  const ratio = max > 0 ? matching / max : 0;
  const r = 4 + ratio * 8; // 4..12
  if (ratio > 0.66) return { r, fill: "oklch(0.45 0.18 25)", opacity: 0.95 }; // red-ish
  if (ratio > 0.33) return { r, fill: "oklch(0.55 0.16 60)", opacity: 0.85 }; // amber
  return { r, fill: "oklch(0.55 0.1 145)", opacity: 0.65 }; // green
}

export function MapView({
  near,
  onNearChange,
}: {
  near: Neighborhood | "all";
  onNearChange: (next: Neighborhood | "all") => void;
}) {
  const [shops, setShops] = React.useState<ShopItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<ShopItem | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams();
    sp.set("limit", "200");
    sp.set("sort", "distance");
    if (near !== "all") {
      sp.set("near", near);
      sp.set("radius_km", "20"); // wide radius for the map view
    }
    fetch(`/api/shops?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { shops: ShopItem[] }) => setShops(j.shops ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [near]);

  // Only shops with valid lat/lon land on the map.
  const mapped = shops.filter((s) => s.lat !== null && s.lon !== null);
  const maxOffers = mapped.reduce((m, s) => Math.max(m, s.matching_offers), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <MapPin className="size-5" aria-hidden />
            نقشه شماتیک فروشگاه‌ها
          </h2>
          <p className="text-xs text-muted-foreground">
            نقشه شماتیک است، نه مسیریابی واقعی. هر نقطه یک فروشگاه است.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">محله:</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onNearChange("all")}
              className={`min-h-9 rounded-full border px-3 py-1 text-xs transition-colors ${
                near === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              همه
            </button>
            {NEIGHBORHOODS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onNearChange(n)}
                className={`min-h-9 rounded-full border px-3 py-1 text-xs transition-colors ${
                  near === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">خطا: {error}</Card>
      )}

      {loading ? (
        <Skeleton className="aspect-[1180/1000] w-full" />
      ) : (
        <div className="relative">
          <Card className="overflow-hidden p-0">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="h-auto w-full"
              role="img"
              aria-label="نقشه شماتیک فروشگاه‌های تهران"
            >
              {/* Background */}
              <rect x={0} y={0} width={VB_W} height={VB_H} className="fill-muted/30" />

              {/* Schematic "city" outline — a soft rounded rectangle for the bbox */}
              <rect
                x={PADDING}
                y={PADDING}
                width={VB_W - 2 * PADDING}
                height={VB_H - 2 * PADDING}
                rx={20}
                className="fill-background stroke-border"
                strokeWidth={2}
              />

              {/* North indicator */}
              <g transform={`translate(${VB_W - 60}, 60)`}>
                <circle r={20} className="fill-background stroke-border" strokeWidth={1.5} />
                <path d="M 0 -12 L 8 8 L 0 4 L -8 8 Z" className="fill-primary" />
                <text y={32} textAnchor="middle" className="fill-foreground text-sm font-semibold">
                  ش
                </text>
              </g>

              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={`gx-${f}`}
                  x1={PADDING + f * (VB_W - 2 * PADDING)}
                  y1={PADDING}
                  x2={PADDING + f * (VB_W - 2 * PADDING)}
                  y2={VB_H - PADDING}
                  className="stroke-border"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                />
              ))}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={`gy-${f}`}
                  x1={PADDING}
                  y1={PADDING + f * (VB_H - 2 * PADDING)}
                  x2={VB_W - PADDING}
                  y2={PADDING + f * (VB_H - 2 * PADDING)}
                  className="stroke-border"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                />
              ))}

              {/* Neighborhood labels */}
              {NEIGHBORHOOD_LABEL_POS.map((n) => (
                <g key={n.name} transform={`translate(${n.x}, ${n.y})`}>
                  <circle r={4} className="fill-primary" />
                  <text
                    x={6}
                    y={-6}
                    className="fill-foreground text-sm font-medium"
                    style={{ fontFamily: "var(--font-vazirmatn), sans-serif" }}
                  >
                    {n.name}
                  </text>
                </g>
              ))}

              {/* Shop dots */}
              {mapped.map((s) => {
                const style = dotStyle(s.matching_offers, maxOffers);
                const cx = lonToX(s.lon!);
                const cy = latToY(s.lat!);
                const isHovered = hovered?.shop_id === s.shop_id;
                return (
                  <g key={s.shop_id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={style.r}
                      fill={style.fill}
                      opacity={isHovered ? 1 : style.opacity}
                      stroke={isHovered ? "var(--foreground)" : "transparent"}
                      strokeWidth={isHovered ? 1.5 : 0}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHovered(s)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setHovered(s)}
                      role="button"
                      aria-label={`${s.name}: ${toPersianDigits(s.matching_offers)} پیشنهاد`}
                    >
                      <title>{`${s.name} — ${toPersianDigits(s.matching_offers)} پیشنهاد`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </Card>

          {/* Hover info card */}
          {hovered && (
            <Card className="pointer-events-none absolute bottom-3 right-3 w-64 max-w-[80%] gap-2 p-3 shadow-md">
              <div className="flex items-center gap-2">
                <Store className="size-4 text-primary" aria-hidden />
                <span className="line-clamp-1 text-sm font-semibold">{hovered.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hovered.location_label && <Badge variant="outline">{hovered.location_label}</Badge>}
                {hovered.distance_km !== null && (
                  <Badge variant="secondary" className="font-num">
                    {formatDistanceKm(hovered.distance_km)}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-num">
                  {toPersianDigits(hovered.matching_offers)} پیشنهاد
                </Badge>
              </div>
              {hovered.address && (
                <p className="text-xs text-muted-foreground">{hovered.address}</p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Legend */}
      <Card className="flex flex-wrap items-center gap-4 p-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <Info className="size-3.5" aria-hidden /> راهنما:
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ background: "oklch(0.55 0.1 145)" }}
          />
          کم
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-4 rounded-full"
            style={{ background: "oklch(0.55 0.16 60)" }}
          />
          متوسط
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-5 rounded-full"
            style={{ background: "oklch(0.45 0.18 25)" }}
          />
          زیاد
        </span>
        <span className="text-muted-foreground">اندازه و رنگ بر اساس تعداد پیشنهاد منطبق</span>
      </Card>

      {!loading && mapped.length === 0 && !error && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          هیچ فروشگاهی با موقعیت مکانی در این ناحیه یافت نشد.
        </Card>
      )}
    </div>
  );
}
