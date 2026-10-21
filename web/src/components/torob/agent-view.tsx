"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bot, ChevronDown, Loader2, Send, User, Wrench, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { toPersianDigits } from "./format";
import type { AgentResponse } from "./types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tool?: string | null;
  toolArgs?: Record<string, unknown> | null;
  toolResult?: unknown;
  toolError?: string | null;
}

const STARTERS = [
  "ارزون‌ترین ماوس بی‌سیم؟",
  "فروشگاه موبایل نزدیک صادقیه",
  "لپ‌تاپ‌های زیر ۲۵ میلیون",
  "برنامه خرید ماوس و کیبورد",
];

function trimResult(r: unknown): string {
  try {
    const s = JSON.stringify(r, null, 2);
    if (!s) return "";
    return s.length > 1200 ? s.slice(0, 1200) + "…" : s;
  } catch {
    return String(r);
  }
}

function ToolCard({ msg }: { msg: ChatMessage }) {
  const [open, setOpen] = React.useState(false);
  if (!msg.tool && !msg.toolError) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2 rounded-lg border border-border bg-muted/30">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Wrench className="size-3.5" aria-hidden />
            ابزار استفاده‌شده
            {msg.tool && <Badge variant="outline" className="font-mono">{msg.tool}</Badge>}
            {msg.toolError && (
              <Badge className="gap-1 bg-destructive text-white">
                <AlertTriangle className="size-3" aria-hidden />
                خطا
              </Badge>
            )}
          </span>
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-3 py-2">
        {msg.toolError && (
          <p className="mb-2 text-xs text-destructive">خطا: {msg.toolError}</p>
        )}
        {msg.toolArgs && Object.keys(msg.toolArgs).length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs text-muted-foreground">آرگومان‌ها:</p>
            <pre className="scrollbar-thin max-h-40 overflow-auto rounded bg-background p-2 text-xs font-mono" dir="ltr">
              {JSON.stringify(msg.toolArgs, null, 2)}
            </pre>
          </div>
        )}
        {msg.toolResult !== null && msg.toolResult !== undefined && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">نتیجه (نمایش خلاصه):</p>
            <pre className="scrollbar-thin max-h-60 overflow-auto rounded bg-background p-2 text-xs font-mono" dir="ltr">
              {trimResult(msg.toolResult)}
            </pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AgentView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as AgentResponse;
      const aMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: j.reply || (j.error ? `خطا: ${j.error}` : "پاسخی دریافت نشد."),
        tool: j.tool ?? null,
        toolArgs: j.tool_args ?? null,
        toolResult: j.tool_result ?? null,
        toolError: j.tool_error ?? null,
      };
      setMessages((m) => [...m, aMsg]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `خطا در ارتباط با دستیار: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Bot className="size-5" aria-hidden />
          دستیار هوشمند
        </h2>
        <p className="text-xs text-muted-foreground">
          دستیار با ابزارهای جست‌وجو و مقایسه، سؤال خرید شما را پاسخ می‌گوید.
        </p>
      </header>

      {/* Chat window */}
      <Card className="flex h-[58vh] min-h-[420px] flex-col gap-0 p-0">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4"
          aria-live="polite"
        >
          {messages.length === 0 && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <Bot className="size-10 opacity-40" aria-hidden />
              <p className="text-sm">سؤالی درباره خرید بپرسید…</p>
            </div>
          )}
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex flex-col gap-1 ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.role === "assistant" && <Bot className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />}
                {m.role === "user" && <User className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />}
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
              {m.role === "assistant" && <ToolCard msg={m} />}
            </motion.div>
          ))}
          {loading && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Bot className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>در حال فکر کردن…</span>
              </div>
            </div>
          )}
        </div>

        {/* Starter prompts */}
        {messages.length === 0 && (
          <div className="border-t border-border p-3">
            <p className="mb-2 text-xs text-muted-foreground">نمونه پرسش‌ها:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-9 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="سؤال خود را بنویسید… (Enter برای ارسال)"
            className="min-h-11 max-h-32 flex-1 resize-none"
            aria-label="پیام به دستیار"
            rows={1}
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            <span className="sr-only">ارسال</span>
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {toPersianDigits(messages.length)} پیام در این گفتگو
      </p>
    </div>
  );
}
