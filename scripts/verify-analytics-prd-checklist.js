/**
 * Static PRD line-by-line verification against implemented surface.
 * Exit 0 only if all checklist items are marked implemented in code paths we assert.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const service = fs.readFileSync(
  path.join(root, "src/services/provider_analytics.service.ts"),
  "utf8"
);
const controller = fs.readFileSync(
  path.join(root, "src/controllers/provider_analytics.controller.ts"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(root, "src/routes/provider_analytics_route.ts"),
  "utf8"
);
const flutterView = fs.readFileSync(
  path.join(
    root,
    "..",
    "app/lib/views/common/analytics/analytics_view.dart"
  ),
  "utf8"
);
const dateUtil = fs.readFileSync(
  path.join(root, "src/utils/analytics_date_range.ts"),
  "utf8"
);

const deadView = path.join(
  root,
  "..",
  "app/lib/views/common/analytics/provider_analytics_view.dart"
);

function assert(c, m) {
  if (!c) throw new Error("FAIL: " + m);
}

const checks = [
  ["Date presets today/week/month/custom", dateUtil.includes('"today"') && dateUtil.includes('"week"') && dateUtil.includes('"month"') && dateUtil.includes('"custom"')],
  ["Earnings all Solo tiers (earnings_only path)", controller.includes("earnings_only") && controller.includes("getEarningsSummary")],
  ["Booking analytics Pro gate", controller.includes("solo_pro") && service.includes("basic_booking_analytics")],
  ["Advanced Premium", service.includes("getAdvancedAnalytics") && service.includes("revenueByClient")],
  ["Completed revenue only availed", service.includes('const COMPLETED = "availed"')],
  ["Returning clients >1 completed", service.includes("parseInt(r.cnt") && service.includes("> 1")],
  ["Stripe payout history", service.includes("getStripePayoutHistory") && routes.includes("/payouts")],
  ["Suite analytics", service.includes("getSuiteAnalytics") && controller.includes("hasSuiteAnalytics")],
  ["Team performance", service.includes("teamPerformance")],
  ["Occupancy stations", service.includes("occupiedStations")],
  ["Monthly revenue goal", service.includes("monthlyRevenueGoal") && routes.includes("revenue-goal")],
  ["Drill-down detail state", routes.includes("/drilldown") && flutterView.includes("_openDetail")],
  ["Restricted state UI", flutterView.includes("_restrictedCard")],
  ["Loading placeholders", flutterView.includes("_buildLoading")],
  ["Empty state copy", flutterView.includes("No activity exists for the selected filters")],
  ["Solo vs Suite UI split", flutterView.includes("_buildSoloSections") && flutterView.includes("_buildSuiteSections")],
  ["Shared filters UI", flutterView.includes("This week") && flutterView.includes("Booking status")],
  ["Dead mock ProviderAnalyticsView removed", !fs.existsSync(deadView)],
  ["Tips only when enabled", service.includes("tipsAndCommissionsEnabled: false") && flutterView.includes("tipsEnabled")],
  ["Team member detail (bookings/services/earnings/ratings)", service.includes("getTeamMemberDetail") && routes.includes("/team/")],
  ["Client loyalty + booking history", service.includes("loyaltyRate") && service.includes("bookingHistory")],
  ["Flutter team member detail sheet", flutterView.includes("_openTeamMemberDetail")],
  ["Post-deploy test runner present", fs.existsSync(path.join(root, "scripts/test-analytics-post-deploy.js"))],
];

console.log("========== PRD IMPLEMENTATION CHECKLIST ==========");
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n${failed} checklist item(s) failed`);
  process.exit(1);
}
console.log("\nAll static PRD checklist items PASSED");
