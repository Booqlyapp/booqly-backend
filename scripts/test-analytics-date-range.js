/**
 * Phase 1 unit checks for PRD date presets (no DB).
 */
const {
  resolveAnalyticsDateRange,
  previousPeriodRange,
} = require("../dist/utils/analytics_date_range.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const now = new Date("2026-10-07T15:30:00");

const today = resolveAnalyticsDateRange({ period: "today", now });
assert(today.preset === "today", "today preset");
assert(today.startDate.getHours() === 0, "today start");
assert(today.endDate.getDate() === 7, "today end day");

const week = resolveAnalyticsDateRange({ period: "week", now });
assert(week.preset === "week", "week preset");
assert(week.startDate.getDay() === 0, "week starts Sunday");

const month = resolveAnalyticsDateRange({ period: "month", now });
assert(month.preset === "month", "month preset");
assert(month.startDate.getDate() === 1, "month starts 1st");

const custom = resolveAnalyticsDateRange({
  startDate: "2026-09-01",
  endDate: "2026-09-15",
  now,
});
assert(custom.preset === "custom", "custom preset");
assert(custom.startDate.getMonth() === 8, "custom start September");

let threw = false;
try {
  resolveAnalyticsDateRange({
    startDate: "2026-09-20",
    endDate: "2026-09-01",
    now,
  });
} catch {
  threw = true;
}
assert(threw, "invalid custom range throws");

const prev = previousPeriodRange(week);
assert(prev.endDate.getTime() < week.startDate.getTime(), "previous ends before current");

console.log("Phase 1 date-range tests PASSED");
