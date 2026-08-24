/**
 * UWF publishing strategy: long-form video every day, Monday through Sunday.
 * Public YouTube publish time: 22:00 Pakistan time (Asia/Karachi).
 */
export function formatForDate(_date: Date): "long" {
  return "long";
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
