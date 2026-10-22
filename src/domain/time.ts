/**
 * Local date labels for the inbox and conversation threads.
 *
 * Everything is resolved in the device's own time zone, so a message sent at
 * 00:05 belongs to the new day even though its UTC timestamp still names the
 * old one. `now` and `locale` are explicit parameters so the rules can be
 * tested without depending on the clock or the machine's language.
 *
 * Pure by design: no React Native, storage, or state imports.
 */

export type TimeValue = Date | number | string | null | undefined;

export type TimeFormatOptions = {
  /** The moment "today" is measured from. Defaults to the current time. */
  now?: Date | number;
  /** A BCP 47 locale. Defaults to the device locale. */
  locale?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Weekday names stop at six days; the seventh day gets a date. */
const WEEKDAYS_IN_WINDOW = 6;

function toDate(value: TimeValue): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days between two local dates. Rounding absorbs the hour a
 * daylight-saving switch adds or removes, so the labels never skip a day.
 */
function daysBefore(date: Date, now: Date): number {
  return Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / DAY_MS,
  );
}

function format(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
  date: Date,
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    // An invalid locale must not crash a chat list; English is a safe fallback.
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
}

/** The time of day, localized: "9:05 AM" in en-US. */
function clockTime(date: Date, locale: string | undefined): string {
  return format(locale, { hour: "numeric", minute: "2-digit" }, date);
}

/** The shortened weekday: "Mon" in en-US. */
function weekday(date: Date, locale: string | undefined): string {
  return format(locale, { weekday: "short" }, date);
}

/** "Oct 14", or "Dec 31, 2025" when the year is not the current one. */
function shortDate(date: Date, now: Date, locale: string | undefined): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return format(
    locale,
    { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) },
    date,
  );
}

/**
 * A stable `YYYY-MM-DD` key in local time. Grouping by this key keeps a
 * conversation together across midnight instead of splitting it by UTC day.
 */
export function localDayKey(value: TimeValue): string | null {
  const date = toDate(value);
  if (!date) return null;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The inbox timestamp: the clock time today, "Yesterday", a weekday within
 * six days, then a short date. Returns null for a missing or invalid value so
 * a caller can fall back to a cached label.
 */
export function chatTimeLabel(
  value: TimeValue,
  options: TimeFormatOptions = {},
): string | null {
  const date = toDate(value);
  const now = toDate(options.now ?? Date.now());
  if (!date || !now) return null;
  const days = daysBefore(date, now);
  if (days === 0) return clockTime(date, options.locale);
  if (days === 1) return "Yesterday";
  if (days > 1 && days <= WEEKDAYS_IN_WINDOW) {
    return weekday(date, options.locale);
  }
  return shortDate(date, now, options.locale);
}

/**
 * The chip above the first message of a day: "Today", "Yesterday", a weekday
 * within six days, then a short date.
 */
export function daySeparatorLabel(
  value: TimeValue,
  options: TimeFormatOptions = {},
): string | null {
  const date = toDate(value);
  const now = toDate(options.now ?? Date.now());
  if (!date || !now) return null;
  const days = daysBefore(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days <= WEEKDAYS_IN_WINDOW) {
    return weekday(date, options.locale);
  }
  return shortDate(date, now, options.locale);
}
