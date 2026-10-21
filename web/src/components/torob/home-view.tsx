"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Package, Search, Store, Tags, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, toPersianDigits } from "./format";
import type { MetaResponse, StatsCategory } from "./types";

const EXAMPLE_QUERIES = [
  "ماوس بی‌سیم تا ۱ میلیون",
  "ماوس با سیم",
  "لپ‌تاپ ایسوس",
  "هدفون بی‌سیم",
];

function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card className="flex items-center gap-4 p-4 sm:p-6">
      <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-24" />
        ) : (
          <span className="text-2xl font-bold font-num">{formatNumber(value)}</span>
        )}
      </div>
    </Card>
  );
}

export function HomeView({
  meta,
  categories,
  loadingMeta,
  loadingStats,
  onSearch,
}: {
  meta: MetaResponse | null;
  categories: StatsCategory[];
  loadingMeta: boolean;
  loadingStats: boolean;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    onSearch(value);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:py-12">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <Badge variant="secondary" className="gap-1">
          <Store className="size-3" aria-hidden />
          دستیار خرید هوشمند تهران
        </Badge>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">طرب‌گارد</h1>
        <p className="max-w-2xl text-balance text-sm text-muted-foreground sm:text-base">
          جست‌وجو، مقایسه و پیدا کردن بهترین پیشنهاد محصول در فروشگاه‌های تهران — همراه
          با نقشه شماتیک و دستیار هوشمند.
        </p>

        {/* Big search box */}
        <form onSubmit={submit} className="mt-4 flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="نام محصول، برند یا دسته… مثلاً «ماوس بی‌سیم»"
              className="h-12 pr-10 text-base"
              aria-label="جست‌وجوی محصول"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 min-h-11 px-6">
            جست‌وجو
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        </form>

        {/* Example query chips */}
        <div className="flex flex-wrap items-center justify-center gap-2" aria-label="نمونه جست‌وجو">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                onSearch(ex);
              }}
              className="min-h-9 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              «{ex}»
            </button>
          ))}
        </div>
      </motion.section>

      {/* Stat cards */}
      <section aria-label="آمار کلی" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="تعداد محصولات"
          icon={<Package className="size-6" aria-hidden />}
          value={meta?.counts.products ?? null}
          loading={loadingMeta}
        />
        <StatCard
          label="فروشگاه‌ها"
          icon={<Store className="size-6" aria-hidden />}
          value={meta?.counts.shops ?? null}
          loading={loadingMeta}
        />
        <StatCard
          label="پیشنهادها"
          icon={<Tags className="size-6" aria-hidden />}
          value={meta?.counts.offers ?? null}
          loading={loadingMeta}
        />
      </section>

      {/* Category quick-links */}
      <section aria-label="دسته‌بندی‌ها" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">دسته‌بندی‌های محبوب</h2>
        </div>
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => onSearch(c.category)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-right transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label={`جست‌وجو در دسته ${c.category}`}
              >
                <span className="line-clamp-1 text-sm font-medium">{c.category}</span>
                <Badge variant="secondary" className="font-num">
                  {toPersianDigits(c.c)}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
