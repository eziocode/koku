"use client";

import { useEffect, useState } from "react";

const QUOTE_API = "https://api.quotable.io/quotes/random?limit=1&maxLength=180";
const CACHE_KEY = "koku-daily-quote";

interface Quote {
  content: string;
  author: string;
}

interface CachedQuote {
  date: string;
  quote: Quote;
}

function todayKey() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

export function DailyQuote() {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    let active = true;

    async function loadQuote() {
      const date = todayKey();

      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as CachedQuote;
          if (active && parsed.date === date && parsed.quote?.content && parsed.quote.author) {
            setQuote(parsed.quote);
            return;
          }
        }

        const response = await fetch(QUOTE_API, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);

        const quotes = (await response.json()) as Quote[];
        const nextQuote = quotes[0];
        if (!nextQuote?.content || !nextQuote.author || !active) return;

        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ date, quote: nextQuote } satisfies CachedQuote));
        setQuote(nextQuote);
      } catch {
        // Footer stays quiet when external API unavailable.
      }
    }

    void loadQuote();
    const refreshAtMidnight = window.setInterval(() => {
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (!cached || !cached.includes(`\"date\":\"${todayKey()}\"`)) {
        void loadQuote();
      }
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(refreshAtMidnight);
    };
  }, []);

  if (!quote) return null;

  return (
    <figure className="space-y-1">
      <blockquote className="line-clamp-3">“{quote.content}”</blockquote>
      <figcaption className="text-[11px] text-muted-foreground/70">— {quote.author}</figcaption>
    </figure>
  );
}
