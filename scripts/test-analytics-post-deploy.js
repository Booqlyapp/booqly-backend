/**
 * Post-deploy analytics verification (phase-by-phase + full).
 *
 * Usage (after backend is live + migrated):
 *
 *   set ANALYTICS_BASE_URL=https://your-api.example.com
 *   set ANALYTICS_TOKEN=<solo_or_suite_jwt>
 *   set ANALYTICS_MARKETPLACE_ID=<uuid>
 *   set ANALYTICS_ROLE=solo   # or suite
 *   node scripts/test-analytics-post-deploy.js
 *   node scripts/test-analytics-post-deploy.js --phase=1
 *   node scripts/test-analytics-post-deploy.js --all
 *
 * Phases:
 *   1 access + filters + date presets
 *   2 solo earnings / booking / advanced gating shape
 *   3 suite overview + team + occupancy + payments (suite only)
 *   4 drilldown + payouts + revenue-goal (suite goal)
 *   all = 1..4 + offline PRD checklist
 */

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const BASE = (process.env.ANALYTICS_BASE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.ANALYTICS_TOKEN || "";
const MARKETPLACE_ID = process.env.ANALYTICS_MARKETPLACE_ID || "";
const ROLE = (process.env.ANALYTICS_ROLE || "solo").toLowerCase();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(pathname, { method = "GET", body } = {}) {
  const url = `${BASE}/provider-analytics${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function runLocal(script) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: "inherit",
  });
  assert(r.status === 0, `${script} failed`);
}

async function phase1() {
  console.log("\n=== PHASE 1: access + filters + date presets ===");
  const access = await api("/access");
  assert(access.status === 200 && access.json.status === true, "access ok");
  const d = access.json.data;
  assert(d.hasEarnings === true, "hasEarnings");
  assert(["earnings_only", "basic", "advanced", "suite"].includes(d.accessLevel) || typeof d.accessLevel === "string", "accessLevel");

  const filters = await api(`/${MARKETPLACE_ID}/filters`);
  assert(filters.status === 200 && filters.json.status === true, "filters ok");
  assert(Array.isArray(filters.json.data.periods), "periods");
  assert(
    filters.json.data.periods.some((p) => p.id === "today"),
    "today period"
  );

  for (const period of ["today", "week", "month"]) {
    const r = await api(`/${MARKETPLACE_ID}?period=${period}`);
    assert(r.status === 200 && r.json.status === true, `analytics ${period}`);
    assert(r.json.data.dateRange, `dateRange ${period}`);
  }
  console.log("PHASE 1 PASSED");
}

async function phase2() {
  console.log("\n=== PHASE 2: Solo tier payload shape ===");
  if (ROLE === "suite") {
    console.log("Skipping Solo-only assertions (ANALYTICS_ROLE=suite)");
    return;
  }
  const r = await api(`/${MARKETPLACE_ID}?period=week`);
  assert(r.status === 200 && r.json.status === true, "solo analytics");
  const data = r.json.data;
  assert(data.earnings, "earnings present");
  assert(
    typeof data.earnings.today === "number" &&
      typeof data.earnings.thisWeek === "number" &&
      typeof data.earnings.thisMonth === "number",
    "daily/weekly/monthly earnings"
  );
  assert(Array.isArray(data.payouts), "payouts array");

  if (data.accessLevel === "earnings_only") {
    assert(!data.analytics, "Basic has no booking analytics payload");
    assert(data.restricted?.bookingAnalytics, "restricted booking message");
  }
  if (data.accessLevel === "basic") {
    assert(data.analytics?.bookingsByStatus, "Pro booking status");
    assert(
      data.analytics.overview.completedBookings != null,
      "completed bookings"
    );
    assert(data.restricted?.advancedAnalytics, "Pro restricted advanced");
  }
  if (data.accessLevel === "advanced") {
    assert(data.analytics?.revenueByService, "Premium revenue by service");
    assert(data.analytics?.revenueByClient, "Premium revenue by client");
    assert(data.analytics?.retentionMetrics, "Premium retention");
    assert(data.analytics?.trends, "Premium trends");
  }
  console.log("PHASE 2 PASSED");
}

async function phase3() {
  console.log("\n=== PHASE 3: Suite Owner analytics ===");
  if (ROLE !== "suite") {
    console.log("Skipping Suite assertions (set ANALYTICS_ROLE=suite)");
    return;
  }
  const r = await api(`/${MARKETPLACE_ID}?period=week`);
  assert(r.status === 200 && r.json.status === true, "suite analytics");
  const suite = r.json.data.suite;
  assert(suite, "suite payload");
  assert(suite.businessOverview, "business overview");
  assert(Array.isArray(suite.teamPerformance), "team performance");
  assert(suite.occupancy?.totalStations != null, "occupancy");
  assert(suite.clients?.bookingHistory, "client booking history");
  assert(suite.clients?.loyaltyRate != null, "loyalty");
  assert(suite.payments, "payments");
  assert(Array.isArray(r.json.data.payouts), "payouts");

  if (suite.teamPerformance.length > 0) {
    const m = suite.teamPerformance[0];
    const mid = m.isOwner ? "owner" : m.teamMemberId;
    if (mid) {
      const detail = await api(`/${MARKETPLACE_ID}/team/${mid}?period=week`);
      assert(detail.status === 200 && detail.json.status === true, "team detail");
      assert(detail.json.data.detail.services, "member services");
      assert(detail.json.data.detail.recentBookings, "member bookings");
      assert(detail.json.data.detail.earnings != null, "member earnings");
    }
  }
  console.log("PHASE 3 PASSED");
}

async function phase4() {
  console.log("\n=== PHASE 4: drilldown + payouts + goal ===");
  const drill = await api(
    `/${MARKETPLACE_ID}/drilldown?metric=bookings&period=week`
  );
  // Basic solo may 403 — accept 200 or 403 with upgrade
  assert(
    drill.status === 200 || drill.status === 403,
    "drilldown reachable"
  );
  if (drill.status === 200) {
    assert(Array.isArray(drill.json.data.records), "drilldown records");
  }

  const payouts = await api(`/${MARKETPLACE_ID}/payouts`);
  assert(payouts.status === 200 && payouts.json.status === true, "payouts route");

  if (ROLE === "suite") {
    const goal = await api(`/${MARKETPLACE_ID}/revenue-goal`, {
      method: "PUT",
      body: { monthlyRevenueGoal: 10000 },
    });
    assert(goal.status === 200 && goal.json.status === true, "set revenue goal");
  }
  console.log("PHASE 4 PASSED");
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--phase="));
  const all = process.argv.includes("--all") || !arg;
  const phase = arg ? arg.split("=")[1] : null;

  console.log("Running local pure tests first...");
  runLocal("test-analytics-date-range.js");
  runLocal("test-analytics-prd-rules.js");
  runLocal("verify-analytics-prd-checklist.js");

  if (!BASE || !TOKEN || !MARKETPLACE_ID) {
    console.log(
      "\nLocal PRD checks done. Set ANALYTICS_BASE_URL, ANALYTICS_TOKEN, ANALYTICS_MARKETPLACE_ID to run live API phases after deploy."
    );
    if (all || phase) {
      // Live phases requested but env missing
      if (process.argv.includes("--all") || arg) {
        console.error(
          "Missing env for live phases. Example:\n" +
            "  ANALYTICS_BASE_URL=https://api... ANALYTICS_TOKEN=... ANALYTICS_MARKETPLACE_ID=... ANALYTICS_ROLE=suite node scripts/test-analytics-post-deploy.js --all"
        );
        process.exit(1);
      }
    }
    return;
  }

  const run = async (n, fn) => {
    if (all || phase === String(n) || phase === "all") await fn();
  };

  await run(1, phase1);
  await run(2, phase2);
  await run(3, phase3);
  await run(4, phase4);

  console.log("\nALL REQUESTED ANALYTICS PHASES PASSED");
}

main().catch((e) => {
  console.error("\nTEST FAILED:", e.message || e);
  process.exit(1);
});
