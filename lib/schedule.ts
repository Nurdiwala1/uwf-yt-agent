/** UWF is permanently Shorts-only: one 30–60 second Short every day. */
export const TIMEZONE = "Asia/Karachi";
export const SHORT_PUBLISH_HOUR_UTC = 17;
export const SHORT_PUBLISH_MINUTE = 0;

export function formatForDate(_date: Date): "short" {
  return "short";
}

/** Returns the daily public YouTube publish slot: 22:00 Asia/Karachi / 17:00 UTC. */
export function dailySlots(date = new Date()): Date[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return [new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), SHORT_PUBLISH_HOUR_UTC, SHORT_PUBLISH_MINUTE, 0))];
}
