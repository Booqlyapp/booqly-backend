/**
 * Booking / block / schedule times are **business wall-clock**, not absolute UTC.
 *
 * Clients send the hour the user picked (e.g. 4:00 PM → `16:00` in the string).
 * A trailing `Z` or `+05:00` must not shift those digits — schedule `getHours()`
 * on a UTC server and Flutter wall-clock display both expect the same numbers.
 */
export function parseBookingDateTime(input: string | Date): Date {
  if (input instanceof Date) {
    return input;
  }

  const raw = String(input).trim();
  const match = raw.match(
    /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?/
  );

  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6] ?? "0", 10);
    const msRaw = match[7] ?? "0";
    const ms = parseInt(msRaw.padEnd(3, "0").slice(0, 3), 10);
    return new Date(Date.UTC(year, month, day, hour, minute, second, ms));
  }

  return new Date(raw);
}
