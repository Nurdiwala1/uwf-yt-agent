/**
 * UWF publishing strategy:
 * - Friday + Sunday: one YouTube Short (30–60s)
 * - All other days: one long-form video (5–10m)
 * Public YouTube publish time: 22:00 Pakistan time (Asia/Karachi).
 */
export function formatForDate(date: Date): "short" | "long" {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    weekday: "long",
  }).format(date);

  return weekday === "Friday" || weekday === "Sunday" ? "short" : "long";
}

/** Returns the daily public YouTube publish slot: 22:00 Asia/Karachi (17:00 UTC). */
export function dailySlots(date = new Date()): Date[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  return [new Date(Date.UTC(year, month - 1, day, 17, 0, 0))];
}
