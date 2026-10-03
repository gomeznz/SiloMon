"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "";

// Submits the viewer's IANA timezone (e.g. "Pacific/Auckland") alongside a
// form, because the server runs in UTC and has no other way to know what
// "1 September" means to this viewer — see resolveCustomRange in
// src/lib/trend-range.ts. useSyncExternalStore (rather than an effect that
// sets state) gives the server render an empty value and the browser the
// real one, without a hydration mismatch.
export function TimezoneField() {
  const tz = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
  return <input type="hidden" name="tz" value={tz} />;
}
