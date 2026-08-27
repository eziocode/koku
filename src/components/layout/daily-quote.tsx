"use client";

import { useEffect, useState } from "react";

interface Quote {
  content: string;
  author: string;
}

const QUOTES: Quote[] = [
  { content: "The key is not to prioritize what is on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { content: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" },
  { content: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.", author: "Stephen King" },
  { content: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { content: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { content: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { content: "How we spend our days is, of course, how we spend our lives.", author: "Annie Dillard" },
  { content: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
  { content: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
  { content: "Slow is smooth, and smooth is fast.", author: "Navy SEAL adage" },
  { content: "Well begun is half done.", author: "Aristotle" },
  { content: "Beware the barrenness of a busy life.", author: "Socrates" },
  { content: "What gets measured gets managed.", author: "Peter Drucker" },
  { content: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { content: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese proverb" },
  { content: "Discipline equals freedom.", author: "Jocko Willink" },
  { content: "You can do anything, but not everything.", author: "David Allen" },
  { content: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { content: "A year from now you may wish you had started today.", author: "Karen Lamb" },
  { content: "Small deeds done are better than great deeds planned.", author: "Peter Marshall" },
  { content: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { content: "Work expands so as to fill the time available for its completion.", author: "C. Northcote Parkinson" },
  { content: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { content: "Absorb what is useful, discard what is not, add what is uniquely your own.", author: "Bruce Lee" },
  { content: "Great things are not done by impulse, but by a series of small things brought together.", author: "Vincent van Gogh" },
  { content: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { content: "Order your soul. Reduce your wants.", author: "Augustine" },
  { content: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { content: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { content: "The obstacle is the way.", author: "Marcus Aurelius" },
  { content: "If you spend too long sharpening the axe, the tree stays standing.", author: "Anonymous" },
];

/** Days elapsed since the Unix epoch in the viewer's local timezone. */
function localDayNumber(now: Date) {
  const midnightLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(midnightLocal.getTime() / 86_400_000);
}

/**
 * Deterministic per-day index. The multiply-xor step keeps consecutive days from
 * landing on neighbouring quotes, so the rotation doesn't look like a straight walk.
 */
function quoteForDay(day: number): Quote {
  const scrambled = Math.abs(Math.imul(day ^ 0x5f3d, 0x2545f491)) % QUOTES.length;
  return QUOTES[scrambled];
}

export function DailyQuote() {
  // Server render and first client paint must agree, so start from a fixed quote
  // and swap to the day's pick once we know the viewer's local date.
  const [quote, setQuote] = useState<Quote>(QUOTES[0]);

  useEffect(() => {
    const apply = () => setQuote(quoteForDay(localDayNumber(new Date())));
    apply();

    const tick = window.setInterval(apply, 60_000);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <figure className="space-y-1">
      <blockquote className="line-clamp-3">“{quote.content}”</blockquote>
      <figcaption className="text-[11px] text-muted-foreground/70">— {quote.author}</figcaption>
    </figure>
  );
}
