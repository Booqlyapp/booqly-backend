/**
 * Source + (optional live) checks that web/external booking statuses
 * match app booking statuses for provider/owner UI.
 *
 * Usage: node scripts/test-web-app-booking-status-parity.js
 */
const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const failures = [];
const pass = (l) => console.log(`PASS  ${l}`);
const fail = (l, e) => {
  console.error(`FAIL  ${l}: ${e.message || e}`);
  failures.push(l);
};

try {
  const enums = read("../src/utils/ensure-database-enums.ts");
  assert(
    enums.includes('enum_ExternalAppointments_status') &&
      enums.includes("'postponed'") &&
      enums.includes("'availed'"),
    "ensure-database-enums missing ExternalAppointments postponed/availed"
  );
  pass("enum bootstrap adds postponed + availed");
} catch (e) {
  fail("enum bootstrap", e);
}

try {
  const model = read("../src/models/external_appointment_model.ts");
  assert(model.includes('"postponed"'), "model missing postponed");
  assert(model.includes('"availed"'), "model missing availed");
  pass("external appointment model statuses");
} catch (e) {
  fail("external model", e);
}

try {
  const ctrl = read("../src/controllers/external_appointment_controller.ts");
  assert(ctrl.includes('"postponed"'), "controller missing postponed");
  assert(ctrl.includes('"availed"'), "controller missing availed");
  assert(
    /activeStatuses\s*=\s*\[[^\]]*postponed/.test(ctrl),
    "activeStatuses should include postponed"
  );
  pass("external status update controller");
} catch (e) {
  fail("external controller", e);
}

try {
  const analytics = read("../src/services/provider_analytics.service.ts");
  assert(
    analytics.includes('["completed", "availed"]') ||
      analytics.includes("completed\", \"availed\""),
    "analytics should treat availed as completed for web"
  );
  pass("analytics completed = completed|availed");
} catch (e) {
  fail("analytics", e);
}

try {
  const details = read(
    "../../app/lib/views/solo/home/widgets/external_appointment_details_view.dart"
  );
  assert(
    details.includes("_updateAppointmentStatus('availed')"),
    "web Confirm should set availed like app"
  );
  assert(
    details.includes("status: 'postponed', label: 'Reschedule'"),
    "web dropdown missing Reschedule/postponed"
  );
  assert(
    details.includes("status: 'availed', label: 'Completed'"),
    "web dropdown missing Completed/availed"
  );
  assert(
    details.includes("case 'completed':") && details.includes("return Colors.blue"),
    "legacy completed should render blue like app Completed"
  );
  assert(
    details.includes("AppColors.rescheduleColor"),
    "web postponed color should use rescheduleColor"
  );
  pass("Flutter external details parity");
} catch (e) {
  fail("Flutter external details", e);
}

try {
  const cal = read("../../app/lib/controllers/calendar_controller.dart");
  assert(
    /case 'completed':[\s\S]*return Colors\.blue/.test(cal) ||
      cal.includes("case 'completed': // legacy web"),
    "calendar must color completed/confirmed blue"
  );
  assert(cal.includes("case 'confirmed':"), "calendar missing confirmed color");
  pass("calendar status colors");
} catch (e) {
  fail("calendar colors", e);
}

try {
  const list = read(
    "../../app/lib/views/common/bookings/provider_bookings_list_view.dart"
  );
  assert(
    list.includes("AppColors.rescheduleColor"),
    "list postponed should use rescheduleColor"
  );
  assert(
    list.includes("case 'completed':") && list.includes("return 'Completed'"),
    "list should label completed as Completed"
  );
  pass("provider bookings list parity");
} catch (e) {
  fail("bookings list", e);
}

try {
  const appDetails = read(
    "../../app/lib/views/solo/home/widgets/appointment_details_view.dart"
  );
  assert(
    appDetails.includes("status: 'canceled', label: 'Cancel'"),
    "app dropdown Cancel"
  );
  assert(
    appDetails.includes("status: 'postponed', label: 'Reschedule'"),
    "app dropdown Reschedule"
  );
  assert(
    appDetails.includes("status: 'availed', label: 'Completed'"),
    "app dropdown Completed"
  );
  assert(
    appDetails.includes("_updateAppointmentStatus('availed')"),
    "app Confirm → availed"
  );
  pass("app details still the source of truth");
} catch (e) {
  fail("app details", e);
}

console.log("");
if (failures.length) {
  console.error(`FAILED (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Web/app booking status parity checks passed.");
console.log(
  "NOTE: Backend deploy required before E2E (enum + status API). Flutter-only rebuild is not enough for Reschedule/Completed writes."
);
