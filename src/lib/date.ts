// Converts to YYYY-MM-DD using LOCAL date components, not Date.toISOString()
// (which converts to UTC first and can shift the day depending on the
// device's timezone - e.g. 11pm local on the 20th becomes the 21st in UTC).
export function toISODateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(isoDate: string) {
  // new Date('2026-09-20') parses as UTC midnight, which can display as the
  // 19th in a negative-UTC-offset timezone - append a time to force local
  // parsing instead.
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// NEW, added 2026-07-29 alongside migration 0039 (multi-day events) - real
// gap flagged directly by the user: a roping can run several days (e.g.
// 8/2-8/8), but every event date display before this only ever showed one
// day. endIsoDate is optional/null for a single-day event, in which case
// this is identical to formatDateDisplay() alone.
//   - Same month: "Aug 2-8, 2026" (no redundant month repeated)
//   - Different months: "Aug 30 - Sep 2, 2026"
//   - Different years (a New Year's event, rare but possible): full date
//     on both ends, "Dec 30, 2026 - Jan 2, 2027"
export function formatDateRangeDisplay(startIsoDate: string, endIsoDate: string | null | undefined) {
  if (!endIsoDate || endIsoDate === startIsoDate) return formatDateDisplay(startIsoDate);

  const start = new Date(`${startIsoDate}T00:00:00`);
  const end = new Date(`${endIsoDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return formatDateDisplay(startIsoDate);

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    const monthDay = start.toLocaleDateString('en-US', { month: 'short' });
    return `${monthDay} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
  }
  if (sameYear) {
    const startPart = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endPart = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startPart} - ${endPart}, ${start.getFullYear()}`;
  }
  return `${formatDateDisplay(startIsoDate)} - ${formatDateDisplay(endIsoDate)}`;
}

// NEW, added 2026-07-29 alongside migration 0039 - "is this event still
// relevant to show as upcoming" must check the END of a multi-day event,
// not just its start - otherwise a week-long roping would incorrectly
// look "past" the moment its first day ends, even while it's still
// actively running.
export function isEventStillUpcoming(startIsoDate: string, endIsoDate: string | null | undefined) {
  const anchor = endIsoDate || startIsoDate;
  const d = new Date(`${anchor}T23:59:59`); // through the END of that day, not midnight at its start
  return d.getTime() >= Date.now();
}
