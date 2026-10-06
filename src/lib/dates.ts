import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from "date-fns";

export function relative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  if (diff < 45_000 && diff > -45_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true })
    .replace(" seconds", "s")
    .replace(" second", "s")
    .replace(" minutes", "m")
    .replace(" minute", "m")
    .replace(" hours", "h")
    .replace(" hour", "h");
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  return isThisYear(date) ? format(date, "MMM d") : format(date, "MMM d, yyyy");
}

export function longDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  return format(date, "MMMM d, yyyy");
}

export function timestamp(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "yyyy-MM-dd HH:mm");
}

export function dayLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isThisYear(date) ? "EEEE, MMMM d" : "EEEE, MMMM d, yyyy");
}
