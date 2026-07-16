'use client';

import { useEffect, useState } from 'react';

/** Types out text character-by-character over roughly durationMs. */
export function TypewriterText({
  text,
  durationMs,
}: {
  text: string;
  durationMs: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (!text) return;
    const interval = Math.max(14, durationMs / Math.max(text.length, 1));
    const timer = setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [text, durationMs]);

  return (
    <span>
      {text.slice(0, count)}
      <span className="animate-pulse text-[var(--accent)]">▍</span>
    </span>
  );
}
