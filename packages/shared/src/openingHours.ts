// Subset of Google Places "regularOpeningHours" plus the place's utcOffsetMinutes,
// as stored in restaurants.googleOpeningHours.

export interface OpeningHoursPoint {
  day: number; // 0 = Sunday … 6 = Saturday (Google convention)
  hour: number;
  minute: number;
}

export interface OpeningHoursPeriod {
  open: OpeningHoursPoint;
  close?: OpeningHoursPoint; // absent ⇒ open 24h from `open`
}

export interface OpeningHours {
  weekdayDescriptions?: string[]; // e.g. "Monday: 9:00 AM – 5:00 PM"
  periods?: OpeningHoursPeriod[];
  utcOffsetMinutes?: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const WEEK_MINUTES = 7 * 24 * 60;

/** Wall-clock day/minute at the place's local time (via utcOffsetMinutes). */
function placeLocalNow(hours: OpeningHours, now: Date): { day: number; minuteOfWeek: number } {
  if (typeof hours.utcOffsetMinutes === "number") {
    // Shift the epoch by the place offset, then read UTC fields = local wall clock.
    const shifted = new Date(now.getTime() + hours.utcOffsetMinutes * 60_000);
    const day = shifted.getUTCDay();
    return { day, minuteOfWeek: day * 1440 + shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
  }
  // No offset known — fall back to the runtime's local time.
  const day = now.getDay();
  return { day, minuteOfWeek: day * 1440 + now.getHours() * 60 + now.getMinutes() };
}

function pointToMinuteOfWeek(p: OpeningHoursPoint): number {
  return p.day * 1440 + p.hour * 60 + p.minute;
}

/** Whether the place is open at `now`, from the periods; null if periods unknown. */
export function computeOpenNow(hours: OpeningHours, now: Date): boolean | null {
  const periods = hours.periods;
  if (!periods || periods.length === 0) return null;

  // A lone period with no close and open at Sunday 00:00 means "open 24/7".
  if (periods.length === 1 && !periods[0]?.close) {
    const o = periods[0]!.open;
    if (o.day === 0 && o.hour === 0 && o.minute === 0) return true;
  }

  const { minuteOfWeek: nowM } = placeLocalNow(hours, now);

  for (const period of periods) {
    const openM = pointToMinuteOfWeek(period.open);
    if (!period.close) continue; // unbounded single-day open — treat as not determinable here
    let closeM = pointToMinuteOfWeek(period.close);
    if (closeM <= openM) closeM += WEEK_MINUTES; // wraps past Saturday→Sunday

    if (nowM >= openM && nowM < closeM) return true;
    // Also check the wrapped window (e.g. a Sat 22:00 → Sun 02:00 period vs a Sun-morning now).
    if (nowM + WEEK_MINUTES >= openM && nowM + WEEK_MINUTES < closeM) return true;
  }
  return false;
}

/** Today's hours line (day prefix stripped) + open-now flag. */
export function getTodayHours(
  hours: OpeningHours | null | undefined,
  now: Date = new Date()
): { todayLabel: string | null; openNow: boolean | null } {
  if (!hours) return { todayLabel: null, openNow: null };

  const { day } = placeLocalNow(hours, now);
  let todayLabel: string | null = null;

  const dayName = DAY_NAMES[day];
  const desc = hours.weekdayDescriptions?.find((d) => dayName && d.startsWith(dayName));
  if (desc) {
    const sep = desc.indexOf(": ");
    todayLabel = sep >= 0 ? desc.slice(sep + 2) : desc;
  }

  return { todayLabel, openNow: computeOpenNow(hours, now) };
}
