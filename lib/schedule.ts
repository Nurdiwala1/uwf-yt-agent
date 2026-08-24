import type { ContentFormat } from "./types";

export function formatForDate(date: Date): ContentFormat {
  const day = date.getUTCDay();
  return day === 0 || day === 5 ? "short" : "long";
}

/** Produces one UTC publishing slot per date (13:00). */
export function dailySlots(date = new Date()): Date[] {
  return [13].map((hour) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour)));
}
