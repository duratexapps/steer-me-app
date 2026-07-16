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
