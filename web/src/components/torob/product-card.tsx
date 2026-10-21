"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatToman, toPersianDigits } from "./format";
import type { SearchItem } from "./types";

/** A small placeholder shown when a product has no image_url. */
function ImagePlaceholder({ title }: { title: string }) {
  return (
    <div
      aria-hidden
      className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <MapPin className="size-7 opacity-40" />
        <span className="line-clamp-2 px-3 text-xs">{title}</span>
      </div>
    </div>
  );
}

export function ProductCard({
  item,
  onSelect,
}: {
  item: SearchItem;
  onSelect: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(item.product_id)}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group text-right"
      aria-label={`مشاهده ${item.title}`}
    >
      <Card className="h-full overflow-hidden p-0 transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60">
        <div className="overflow-hidden">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.title}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <ImagePlaceholder title={item.title} />
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.category && (
              <Badge variant="secondary" className="gap-1">
                <Tag className="size-3" aria-hidden />
                {item.category}
              </Badge>
            )}
            <Badge variant="outline" className="font-num">
              {toPersianDigits(item.offer_count)} پیشنهاد
            </Badge>
          </div>
          <h3 className="line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-relaxed">
            {item.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {item.brand ?? "بدون برند"}
          </p>
          <div className="mt-1 text-sm font-bold font-num text-foreground">
            {item.min_price_toman !== null ? (
              <span>
                <span className="text-muted-foreground text-xs font-normal">از </span>
                {formatToman(item.min_price_toman)}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs font-normal">قیمت نامشخص</span>
            )}
          </div>
        </div>
      </Card>
    </motion.button>
  );
}
