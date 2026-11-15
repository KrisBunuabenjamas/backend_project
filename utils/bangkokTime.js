// Restaurant days follow Bangkok time (UTC+7, no daylight saving).
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar day (YYYY-MM-DD) of an instant, as seen in Bangkok.
const bangkokDay = (date = new Date()) => new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);

// [start, end) instants covering one Bangkok calendar day.
function bangkokDayRange(day) {
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
module.exports = { bangkokDay, bangkokDayRange };
