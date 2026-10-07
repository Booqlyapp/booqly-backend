/**
 * PRD calculation-rule checks (pure logic + date helpers).
 * Returning client = more than one completed appointment.
 */
const {
  resolveAnalyticsDateRange,
} = require("../dist/utils/analytics_date_range.js");

function assert(c, m) {
  if (!c) throw new Error(m);
}

function classifyReturning(clientCompletedCounts) {
  // clientCompletedCounts: Map clientId -> lifetime completed count
  let returning = 0;
  let total = 0;
  for (const [, cnt] of clientCompletedCounts) {
    total += 1;
    if (cnt > 1) returning += 1;
  }
  return {
    totalClients: total,
    returningClients: returning,
    newClients: total - returning,
  };
}

const counts = new Map([
  ["a", 1],
  ["b", 2],
  ["c", 5],
  ["d", 1],
]);
const r = classifyReturning(counts);
assert(r.totalClients === 4, "total");
assert(r.returningClients === 2, "returning >1 completed");
assert(r.newClients === 2, "new");

// Revenue only from completed
function revenueFrom(appts) {
  return appts
    .filter((a) => a.status === "availed")
    .reduce((s, a) => s + a.price, 0);
}
const rev = revenueFrom([
  { status: "availed", price: 100 },
  { status: "canceled", price: 50 },
  { status: "no_show", price: 40 },
  { status: "availed", price: 25 },
]);
assert(rev === 125, "revenue excludes cancel/no-show");

function countSeparate(appts) {
  return {
    completed: appts.filter((a) => a.status === "availed").length,
    canceled: appts.filter((a) => a.status === "canceled").length,
    noShow: appts.filter((a) => a.status === "no_show").length,
  };
}
const sep = countSeparate([
  { status: "availed" },
  { status: "canceled" },
  { status: "no_show" },
  { status: "availed" },
]);
assert(sep.completed === 2 && sep.canceled === 1 && sep.noShow === 1, "separate counts");

// Suite total without double count
const team = [
  { revenue: 100 },
  { revenue: 200 },
  { revenue: 50 },
];
const suiteTotal = team.reduce((s, t) => s + t.revenue, 0);
assert(suiteTotal === 350, "suite sum");

const week = resolveAnalyticsDateRange({
  period: "week",
  now: new Date("2026-10-07"),
});
assert(week.preset === "week", "week filter");

console.log("PRD calculation-rule tests PASSED");
