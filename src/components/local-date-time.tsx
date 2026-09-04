"use client";

import { useEffect, useState } from "react";

// Formatting a date on the server bakes in the SERVER's timezone, not the
// viewer's — Railway's containers run in UTC, so a 9am reading in NZ (UTC+12
// or +13) rendered server-side comes out as 9pm. Deferring the actual
// toLocaleString() call to an effect means it only ever runs in the
// browser, where Intl correctly uses the viewer's own timezone. Renders
// nothing until that effect fires (typically the very next tick) rather
// than showing the wrong time first and correcting itself — this is a
// deliberate client-only escape hatch, not derived state, hence the
// disable below.
type Mode = "datetime" | "time" | "shortTime";

function format(date: Date, mode: Mode): string {
  if (mode === "time") return date.toLocaleTimeString();
  if (mode === "shortTime") return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString();
}

export function LocalDateTime({ value, mode = "datetime" }: { value: Date | string | number; mode?: Mode }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const date = value instanceof Date ? value : new Date(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberately client-only, see file comment above
    setText(format(date, mode));
  }, [value, mode]);

  return text;
}
